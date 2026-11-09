import { describe, expect, test } from "bun:test";
import { createRuntime } from "../../src/runtime/index.ts";
import { secret } from "../../src/core/secret.ts";
import { CODEX_MESSAGE, SCRATCH_OUT, SENTINEL, binFs, fixture, routedRig, sourceOf } from "./support.ts";
import { fakeProcessRunner } from "../support/fakes.ts";

describe("the env transform shapes the child environment", () => {
  test("a transform that adds OPENAI_API_KEY leaves no such key in the codex child, and keeps FOO", async () => {
    const { runtime, specs } = routedRig(
      { stdout: "" },
      { env: (base) => ({ ...base, OPENAI_API_KEY: "transform-value", FOO: "bar" }), source: sourceOf({ OPENAI_API_KEY: "ambient-openai" }) },
      { files: { [SCRATCH_OUT]: CODEX_MESSAGE } },
    );
    const result = await runtime.headless("codex", { credential: { mode: "api-key", key: secret(SENTINEL) } } as never).run({ instructions: "x", input: "y" });
    expect(result.ok).toBe(true);
    const child = specs.find((spec) => spec.args.includes("exec"));
    expect(child?.env.FOO).toBe("bar");
    expect(child?.env.OPENAI_API_KEY).toBeUndefined();
    expect(child?.env.CODEX_API_KEY).toBe(SENTINEL);
  });

  test("a throwing transform fails the run with invalid-config and createRuntime still returns", async () => {
    const procs = fakeProcessRunner([]);
    const runtime = createRuntime({
      source: sourceOf(),
      env: () => {
        throw new Error("boom");
      },
      spawn: procs.runner,
      fs: binFs(),
      platform: "linux",
    });
    const result = await runtime.headless("claude", { credential: { mode: "api-key", key: secret(SENTINEL) } } as never).run({ instructions: "x", input: "y" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("invalid-config");
      expect(result.failure.kind === "invalid-config" ? result.failure.field : null).toBe("env");
    }
    expect(procs.specs.length).toBe(0);
  });
});

describe("HOME is required for credential planning", () => {
  test("HOME unset gives credential/home-unset and no spawn", async () => {
    const { runtime, specs } = routedRig({ stdout: "" }, { source: { PATH: "/bin" } });
    const result = await runtime.headless("claude", { credential: { mode: "api-key", key: secret(SENTINEL) } } as never).run({ instructions: "x", input: "y" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("credential");
      expect(result.failure.kind === "credential" ? result.failure.reason : null).toBe("home-unset");
    }
    expect(specs.filter((spec) => !spec.args.includes("--version")).length).toBe(0);
  });
});

describe("nested harness env is removed from the claude child and probes", () => {
  test("CLAUDECODE and CLAUDE_CODE_ENTRYPOINT are absent from the run and from every probe", async () => {
    const source = sourceOf({ CLAUDECODE: "1", CLAUDE_CODE_ENTRYPOINT: "cli" });
    const { runtime, specs } = routedRig({ stdout: fixture("claude", "claude-result.json") }, { source });
    await runtime.available(["claude"], { timeoutMs: 5000 });
    const result = await runtime.headless("claude", { credential: { mode: "api-key", key: secret(SENTINEL) } } as never).run({ instructions: "x", input: "y" });
    expect(result.ok).toBe(true);
    expect(specs.length).toBeGreaterThan(1);
    for (const spec of specs) {
      expect(spec.env.CLAUDECODE).toBeUndefined();
      expect(spec.env.CLAUDE_CODE_ENTRYPOINT).toBeUndefined();
    }
  });
});
