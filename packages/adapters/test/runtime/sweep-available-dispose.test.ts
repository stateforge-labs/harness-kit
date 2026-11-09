import { describe, expect, test } from "bun:test";
import { buildRuntime, type Availability, type Runtime } from "../../src/driver/create-runtime.ts";
import { secret } from "../../src/core/secret.ts";
import { ISOLATION_PREFIX, SCRATCH_PREFIX } from "../../src/driver/constants.ts";
import { fakeClock, fakeFs, fakeProcessRunner } from "../support/fakes.ts";
import { echoDriver, ECHO_PREFIX, FAKE_INJECT, FAKE_STRIP } from "../support/fake-driver.ts";
import { BIN, RUN_CWD, SENTINEL, binFs, mentions, routedRig, sourceOf } from "./support.ts";
import { CredentialField, finish, homeFailure, secretInjection, unsupportedFailure, type CredentialPlan, type CredentialPlanInput } from "../../src/core/credential-plan.ts";
import { CredentialUnsupportedReason, type RunFailure } from "../../src/core/failure.ts";
import { fail, ok, type Result } from "../../src/core/result.ts";
import type { HarnessDriver } from "../../src/driver/port.ts";
import type { ProcessRunner, RuntimeConfig } from "../../src/driver/ports.ts";
import { createRuntime } from "../../src/runtime/index.ts";

const CRED = { mode: "api-key", key: secret(SENTINEL) };
const TMP = "/tmp";
const GENERIC_MODE = "x";

function genericPlan(input: CredentialPlanInput<"fake">): Result<CredentialPlan, RunFailure> {
  const home = homeFailure(input.env);
  if (home !== null) {
    return fail(home);
  }
  const spec = input.credential;
  if (spec.mode !== GENERIC_MODE) {
    return fail(unsupportedFailure(spec.mode, CredentialUnsupportedReason.UnknownMode));
  }
  return finish(spec.mode, [FAKE_STRIP], secretInjection(spec.key, CredentialField.Key, FAKE_INJECT), null);
}

function genericDriver(): HarnessDriver<"fake"> {
  const base = echoDriver();
  return { ...base, credentials: { ...base.credentials, modes: [GENERIC_MODE], plan: genericPlan } };
}

function genericConfig(spawn: ProcessRunner, extra: Readonly<Record<string, string>> = {}): RuntimeConfig<"fake"> {
  return {
    source: sourceOf(extra),
    spawn,
    fs: fakeFs({ executables: [`${BIN}/fake-cli`] }),
    clock: fakeClock(0),
    platform: "linux",
    cwd: () => RUN_CWD,
  };
}
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20));

describe("sweep removes old orphans and keeps live dirs", () => {
  test("old orphans of both prefixes go, the fresh dir stays", async () => {
    const fs = fakeFs({
      executables: ["/bin/claude"],
      dirs: [
        TMP,
        { path: `${TMP}/${ISOLATION_PREFIX}old`, mtimeMs: 0 },
        { path: `${TMP}/${SCRATCH_PREFIX}old`, mtimeMs: 0 },
        { path: `${TMP}/${ISOLATION_PREFIX}fresh`, mtimeMs: 9_900 },
      ],
    });
    const { runtime } = routedRig({ stdout: "" }, { clock: fakeClock(10_000) }, { fs });
    await runtime.sweep({ olderThanMs: 1_000 });
    expect(fs.removed).toContain(`${TMP}/${ISOLATION_PREFIX}old`);
    expect(fs.removed).toContain(`${TMP}/${SCRATCH_PREFIX}old`);
    expect(fs.removed).not.toContain(`${TMP}/${ISOLATION_PREFIX}fresh`);
  });

  test("a live held run's dir is not swept", async () => {
    const { runtime, fs } = routedRig({ stdout: "", hold: true }, {}, {});
    const held = runtime.headless("claude", { credential: CRED, isolation: { kind: "private-home", retain: "delete" } } as never).run({ instructions: "x", input: "y" });
    await settle();
    const live = [...fs.dirs].find((path) => path.includes(ISOLATION_PREFIX));
    expect(live).toBeDefined();
    await runtime.sweep({ olderThanMs: 0 });
    expect(live === undefined ? true : fs.removed.includes(live)).toBe(false);
    await runtime.close();
    await held;
  });
});

describe("available keeps order and reports each harness", () => {
  test("an unknown id is reported as unknown-harness and order is kept", async () => {
    const { runtime } = routedRig({ stdout: "" });
    const rows: readonly Availability[] = await runtime.available(["claude", "bogus", "codex"] as never, { timeoutMs: 5_000 });
    expect(rows.map((row) => row.id)).toEqual(["claude", "bogus", "codex"]);
    expect(rows[0]?.installed?.version).toBe("2.1.319");
    expect(rows[1]?.reason).toBe("unknown-harness");
    expect(rows[1]?.installed).toBeNull();
  });

  test("a missing binary is reported as binary-missing", async () => {
    const { runtime } = routedRig({ stdout: "" }, {}, { fs: binFs(["claude"]) });
    const rows = await runtime.available(["claude", "codex"], { timeoutMs: 5_000 });
    expect(rows[0]?.reason).toBeNull();
    expect(rows[1]?.reason).toBe("binary-missing");
    expect(rows[1]?.installed).toBeNull();
  });
});

describe("disposal closes the runtime", () => {
  test("await using closes the runtime at block end", async () => {
    let captured: Runtime | null = null;
    {
      await using runtime = createRuntime({ source: sourceOf(), spawn: fakeProcessRunner([]).runner, fs: binFs(), platform: "linux" });
      captured = runtime;
    }
    const after = await (captured as Runtime).headless("claude", { credential: CRED } as never).run({ instructions: "x", input: "y" });
    expect(after.ok).toBe(false);
    if (!after.ok) {
      expect(after.failure.kind === "unavailable" ? after.failure.reason : null).toBe("runtime-closed");
    }
  });

  test("an explicit Symbol.asyncDispose call closes the runtime", async () => {
    const runtime = createRuntime({ source: sourceOf(), spawn: fakeProcessRunner([]).runner, fs: binFs(), platform: "linux" });
    await runtime[Symbol.asyncDispose]();
    const after = await runtime.headless("claude", { credential: CRED } as never).run({ instructions: "x", input: "y" });
    expect(after.ok).toBe(false);
  });
});

describe("the generic path takes any driver map", () => {
  test("a fake fourth driver runs headless through its own credential mode", async () => {
    const procs = fakeProcessRunner([{ stdout: "" }, { stdout: `${ECHO_PREFIX}hello from fake` }]);
    const runtime = buildRuntime({ fake: genericDriver() } as never, genericConfig(procs.runner, { FAKE_KEY: "ambient-fake" }));
    expect(runtime.driver("fake")?.id).toBe("fake");
    expect(runtime.driver("nope")).toBeNull();
    const result = await runtime.headless("fake", { credential: { mode: GENERIC_MODE, key: secret(SENTINEL) } } as never).run({ instructions: "x", input: "y" });
    expect(result.ok).toBe(true);
    const spec = procs.specs.find((item) => item.args[0] === "run");
    expect(spec?.program).toBe(`${BIN}/fake-cli`);
    expect(spec?.env[FAKE_INJECT]).toBe(SENTINEL);
    expect(spec?.env[FAKE_STRIP]).toBeUndefined();
    expect(mentions(spec?.args, SENTINEL)).toBe(false);
    if (result.ok) {
      expect(result.value.text).toBe("hello from fake");
      expect(result.value.credential.requested).toBe(GENERIC_MODE);
      expect(result.value.credential.scrubbed).toEqual([FAKE_STRIP]);
      expect(result.value.credential.billing).toBe("unverified");
      expect(result.value.credential.acknowledgement).toBeNull();
      expect(result.value.credential.verified).toBe(false);
    }
  });

  test("an unknown mode on the fake driver is rejected as credential-unsupported before any run", async () => {
    const procs = fakeProcessRunner([{ stdout: "" }]);
    const runtime = buildRuntime({ fake: genericDriver() } as never, genericConfig(procs.runner));
    const result = await runtime.headless("fake", { credential: { mode: "nope", key: secret(SENTINEL) } } as never).run({ instructions: "x", input: "y" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("credential-unsupported");
    }
    expect(procs.specs.some((item) => item.args[0] === "run")).toBe(false);
  });
});
