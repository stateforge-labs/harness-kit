import { describe, expect, test } from "bun:test";
import type { LibraryEvent, RunEvent } from "../../src/core/run.ts";
import { EnvKind, TOOLS_OFF, type EnvPolicy, type ToolPolicy } from "../../src/core/policy.ts";
import { CLAUDE_PROFILE } from "../../src/claude/profile.ts";
import { secret } from "../../src/core/secret.ts";
import { createRuntime } from "../../src/runtime/index.ts";
import { fakeProcessRunner } from "../support/fakes.ts";
import { CODEX_MESSAGE, OPENCODE_STREAM, SCRATCH_OUT, SENTINEL, binFs, fixture, mentions, routedRig, sourceOf } from "./support.ts";

const CLAUDE_STREAM = fixture("claude", "claude-stream-json-verbose.jsonl");
const API_KEY = { mode: "api-key", key: secret(SENTINEL) } as never;
const LOGIN = { mode: "login-store", acknowledgePolicy: true } as never;
const REQUEST = { instructions: "x", input: "y" };

function runSpecs(specs: readonly { readonly args: readonly string[]; readonly env: Readonly<Record<string, string>>; readonly cwd: string }[]) {
  return specs.filter((spec) => spec.args.includes("-p"));
}

describe("a throwing driver table", () => {
  const table = new Proxy({}, {
    ownKeys() {
      throw new Error("boom");
    },
  });

  test("plan, run and stream give invalid-config drivers and nothing spawns", async () => {
    const procs = fakeProcessRunner([]);
    const runtime = createRuntime({ source: sourceOf(), spawn: procs.runner, fs: binFs(), drivers: table as never });
    const handle = runtime.headless("claude" as never, { credential: API_KEY } as never);
    const planned = handle.plan(REQUEST);
    expect(!planned.ok && planned.failure).toMatchObject({ kind: "invalid-config", field: "drivers" });
    const ran = await handle.run(REQUEST);
    expect(!ran.ok && ran.failure).toMatchObject({ kind: "invalid-config", field: "drivers" });
    const events: RunEvent[] = [];
    for await (const event of handle.stream(REQUEST)) {
      events.push(event);
    }
    expect(events).toHaveLength(1);
    expect(events[0]?.kind === "finished" && !events[0].result.ok && events[0].result.failure).toMatchObject({ field: "drivers" });
    expect(procs.specs).toHaveLength(0);
  });
});

describe("tools policy", () => {
  test("TOOLS_OFF on claude lists three supported cells and their flags", () => {
    const { runtime } = routedRig({ stdout: "" });
    const planned = runtime.headless("claude", { credential: API_KEY, tools: TOOLS_OFF } as never).plan(REQUEST);
    expect(planned.ok).toBe(true);
    if (planned.ok && planned.value.engine === "cli") {
      expect(planned.value.confinement.map((c) => [c.capability, c.support.state])).toEqual([
        ["builtin-tools-off", "supported"],
        ["mcp-none", "supported"],
        ["settings-sources", "supported"],
      ]);
      expect(planned.value.args).toEqual(expect.arrayContaining(["--tools", "--strict-mcp-config", "--setting-sources"]));
    }
  });

  test("the confinement list is on the output", async () => {
    const { runtime } = routedRig({ stdout: CLAUDE_STREAM });
    const result = await runtime.headless("claude", { credential: API_KEY, tools: TOOLS_OFF } as never).run(REQUEST);
    expect(result.ok && result.value.confinement.map((c) => c.capability)).toEqual(["builtin-tools-off", "mcp-none", "settings-sources"]);
  });

  test("strict on an emulated cell is refused with the support and no spawn", async () => {
    const { runtime, specs } = routedRig({ stdout: "" });
    const strict: ToolPolicy = { ...TOOLS_OFF, strict: true };
    const result = await runtime.headless("codex", { credential: { mode: "login-store" }, tools: strict } as never).run(REQUEST);
    expect(!result.ok && result.failure).toMatchObject({ kind: "unsupported", capability: "builtin-tools-off", support: { state: "emulated" } });
    expect(specs).toHaveLength(0);
  });

  test("strict on an unmeasured cell is refused with the support and no spawn", async () => {
    const { runtime, specs } = routedRig({ stdout: "" });
    const strict: ToolPolicy = { builtins: "harness-default", mcp: [], settings: "harness-default", strict: true };
    const result = await runtime.headless("opencode", { credential: { mode: "login-store" }, tools: strict } as never).run(REQUEST);
    expect(!result.ok && result.failure).toMatchObject({ kind: "unsupported", support: { state: "unmeasured" } });
    expect(specs).toHaveLength(0);
  });

  for (const bearer of [secret("tok-SENTINEL"), null]) {
    test(`an mcp endpoint on the cli is unsupported ${bearer === null ? "without" : "with"} a bearer`, async () => {
      const { runtime, specs } = routedRig({ stdout: "" });
      const tools: ToolPolicy = { builtins: "harness-default", settings: "harness-default", mcp: [{ name: "docs", url: "https://example.test/mcp", bearer, allow: [] }] };
      const result = await runtime.headless("claude", { credential: API_KEY, tools } as never).run(REQUEST);
      expect(!result.ok && result.failure).toMatchObject({ kind: "unsupported", capability: "mcp-allowlist", why: bearer === null ? "cli-engine-has-no-mcp-endpoint" : "bearer-never-in-argv" });
      expect(mentions(result, "tok-SENTINEL")).toBe(false);
      expect(specs).toHaveLength(0);
    });
  }
});

describe("env policy", () => {
  const closed: EnvPolicy = { kind: EnvKind.Closed, set: { PATH: "/bin", HOME: "/h/u", KEPT: secret("closed-SECRET") } };

  test("closed inherits nothing, joins secrets to redaction and shows names only in the plan", async () => {
    const { runtime, specs } = routedRig({ stdout: CLAUDE_STREAM }, { source: sourceOf({ AMBIENT: "ambient-value" }) });
    const handle = runtime.headless("claude", { credential: API_KEY, env: closed } as never);
    const planned = handle.plan(REQUEST);
    expect(planned.ok && planned.value.env).toMatchObject({ kind: "closed", set: expect.arrayContaining(["PATH", "HOME", "KEPT"]), inject: ["ANTHROPIC_API_KEY"] });
    expect(mentions(planned, "closed-SECRET")).toBe(false);
    const result = await handle.run(REQUEST);
    expect(result.ok).toBe(true);
    const child = runSpecs(specs)[0];
    expect(child?.env).toEqual({ PATH: "/bin", HOME: "/h/u", KEPT: "closed-SECRET", ANTHROPIC_API_KEY: SENTINEL });
    expect(mentions(result, "closed-SECRET")).toBe(false);
  });

  test("a transform that adds ANTHROPIC_API_KEY under login-store is stripped", async () => {
    const env: EnvPolicy = { kind: EnvKind.Inherit, transform: (base) => ({ ...base, ANTHROPIC_API_KEY: "from-transform", KEEP: "1" }) };
    const { runtime, specs } = routedRig({ stdout: CLAUDE_STREAM });
    const result = await runtime.headless("claude", { credential: LOGIN, env } as never).run(REQUEST);
    expect(result.ok).toBe(true);
    const child = runSpecs(specs)[0];
    expect(child?.env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(child?.env.KEEP).toBe("1");
    expect(result.ok && result.value.credential.scrubbed).toContain("ANTHROPIC_API_KEY");
  });

  test("a throwing transform is invalid-config env", async () => {
    const env: EnvPolicy = {
      kind: EnvKind.Inherit,
      transform: () => {
        throw new Error("boom");
      },
    };
    const { runtime, specs } = routedRig({ stdout: "" });
    const result = await runtime.headless("claude", { credential: API_KEY, env } as never).run(REQUEST);
    expect(!result.ok && result.failure).toMatchObject({ kind: "invalid-config", field: "env" });
    expect(specs).toHaveLength(0);
  });

  test("a transform returning a non-string value is invalid-config env", async () => {
    const env = { kind: EnvKind.Inherit, transform: () => ({ PATH: 5 }) } as unknown as EnvPolicy;
    const { runtime } = routedRig({ stdout: "" });
    const result = await runtime.headless("claude", { credential: API_KEY, env } as never).run(REQUEST);
    expect(!result.ok && result.failure).toMatchObject({ kind: "invalid-config", field: "env" });
  });

  test("closed without PATH is invalid-config env.set.PATH", async () => {
    const env: EnvPolicy = { kind: EnvKind.Closed, set: { HOME: "/h/u" } };
    const { runtime, specs } = routedRig({ stdout: "" });
    const result = await runtime.headless("claude", { credential: API_KEY, env } as never).run(REQUEST);
    expect(!result.ok && result.failure).toMatchObject({ kind: "invalid-config", field: "env.set.PATH" });
    expect(specs).toHaveLength(0);
  });

  test("closed with login-store and no HOME in set is credential home-unset", async () => {
    const env: EnvPolicy = { kind: EnvKind.Closed, set: { PATH: "/bin" } };
    const { runtime } = routedRig({ stdout: "" });
    const result = await runtime.headless("claude", { credential: LOGIN, env } as never).run(REQUEST);
    expect(!result.ok && result.failure).toMatchObject({ kind: "credential", reason: "home-unset" });
  });

  test("closed on codex is unsupported while the cell is unmeasured", async () => {
    const { runtime } = routedRig({ stdout: "" });
    const result = await runtime.headless("codex", { credential: { mode: "login-store" }, env: closed } as never).run(REQUEST);
    expect(!result.ok && result.failure).toMatchObject({ kind: "unsupported", capability: "closed-env" });
  });

  test("closed with quiet is unsupported while the profile quiet env is unmeasured", async () => {
    const { runtime } = routedRig({ stdout: "" });
    const quiet: EnvPolicy = { ...closed, quiet: true } as EnvPolicy;
    const result = await runtime.headless("claude", { credential: API_KEY, env: quiet } as never).run(REQUEST);
    expect(!result.ok && result.failure).toMatchObject({ kind: "unsupported", capability: "closed-env" });
  });
});

describe("credential gates", () => {
  test("allowedModes refuses a mode outside the list before any spawn", async () => {
    const { runtime, specs } = routedRig({ stdout: "" }, { allowedModes: ["api-key"] });
    const result = await runtime.headless("claude", { credential: LOGIN } as never).run(REQUEST);
    expect(!result.ok && result.failure).toMatchObject({ kind: "credential-unsupported", mode: "login-store", reason: "mode-not-allowed" });
    expect(specs).toHaveLength(0);
  });

  test("allowedModes lets a listed mode through", async () => {
    const { runtime } = routedRig({ stdout: CLAUDE_STREAM }, { allowedModes: ["api-key"] });
    expect((await runtime.headless("claude", { credential: API_KEY } as never).run(REQUEST)).ok).toBe(true);
  });

  test("a base url on codex is unsupported while the cell is unmeasured", async () => {
    const { runtime, specs } = routedRig({ stdout: "" });
    const credential = { mode: "api-key", key: secret(SENTINEL), baseUrl: "https://gateway.test" } as never;
    const result = await runtime.headless("codex", { credential } as never).run(REQUEST);
    expect(!result.ok && result.failure).toMatchObject({ kind: "unsupported", capability: "base-url", support: { state: "unmeasured" } });
    expect(specs).toHaveLength(0);
  });

  test("the engine sdk is unsupported", async () => {
    const { runtime } = routedRig({ stdout: "" });
    const result = await runtime.headless("claude", { credential: API_KEY, engine: "sdk" } as never).run(REQUEST);
    expect(!result.ok && result.failure).toMatchObject({ kind: "unsupported", capability: "engine", engine: "sdk", why: "not-implemented" });
  });
});

describe("cost basis", () => {
  test("a list cost under api-key is billed and under login-store stays list", async () => {
    const keyed = { mode: "api-key", key: secret(SENTINEL), provider: "openai" } as never;
    const billed = await routedRig({ stdout: OPENCODE_STREAM }).runtime.headless("opencode", { credential: keyed } as never).run(REQUEST);
    const listed = await routedRig({ stdout: OPENCODE_STREAM }).runtime.headless("opencode", { credential: { mode: "login-store" } } as never).run(REQUEST);
    expect(billed.ok && billed.value.cost.basis).toBe("billed");
    expect(listed.ok && listed.value.cost.basis).toBe("list");
    expect(billed.ok && billed.value.cost.usd).toBe(listed.ok ? listed.value.cost.usd : null);
  });

  test("codex stays unavailable", async () => {
    const { runtime } = routedRig({ stdout: "" }, {}, { files: { [SCRATCH_OUT]: CODEX_MESSAGE } });
    const result = await runtime.headless("codex", { credential: { mode: "api-key", key: secret(SENTINEL) } } as never).run(REQUEST);
    expect(result.ok && result.value.cost.basis).toBe("unavailable");
  });
});

describe("private cwd", () => {
  async function runWith(retain: "delete" | "keep") {
    const events: LibraryEvent[] = [];
    const rig = routedRig({ stdout: CLAUDE_STREAM }, { onEvent: (event) => events.push(event) });
    const handle = rig.runtime.headless("claude", { credential: API_KEY, cwd: { private: retain } } as never);
    const planned = handle.plan(REQUEST);
    const result = await handle.run(REQUEST);
    return { events, rig, planned, result };
  }

  test("delete makes the directory, runs in it and removes it", async () => {
    const { events, rig, planned, result } = await runWith("delete");
    expect(planned.ok && planned.value.cwd).toEqual({ kind: "private", retain: "delete" });
    const dir = result.ok ? result.value.cwd : "";
    expect(runSpecs(rig.specs)[0]?.cwd).toBe(dir);
    expect(dir.startsWith("/tmp/stateforge-adapters-cwd-")).toBe(true);
    expect(events.filter((event) => event.kind === "cwd-created" || event.kind === "cwd-removed").map((event) => event.kind)).toEqual(["cwd-created", "cwd-removed"]);
    expect(rig.fs.dirs.has(dir)).toBe(false);
  });

  test("keep leaves the directory in place and emits no removal", async () => {
    const { events, rig, result } = await runWith("keep");
    const dir = result.ok ? result.value.cwd : "";
    expect(events.filter((event) => event.kind === "cwd-created" || event.kind === "cwd-removed").map((event) => event.kind)).toEqual(["cwd-created"]);
    expect(rig.fs.dirs.has(dir)).toBe(true);
  });

  test("a given path stays given", () => {
    const { runtime } = routedRig({ stdout: "" });
    const planned = runtime.headless("claude", { credential: API_KEY, cwd: "/work/x" } as never).plan(REQUEST);
    expect(planned.ok && planned.value.cwd).toEqual({ kind: "given", retain: null });
  });
});

describe("events of a cli one-shot engine", () => {
  test("only started, text, unrecognised and finished are emitted", async () => {
    const { runtime } = routedRig({ stdout: CLAUDE_STREAM });
    const seen = new Set<string>();
    for await (const event of runtime.headless("claude", { credential: API_KEY } as never).stream(REQUEST)) {
      seen.add(event.kind);
    }
    expect([...seen].every((kind) => ["started", "text", "unrecognised", "finished"].includes(kind))).toBe(true);
    expect(seen.has("started")).toBe(true);
    expect(seen.has("finished")).toBe(true);
  });
});

describe("prompt limit and capabilities", () => {
  test("claude carries instructions in argv and reports its measured limit, the others read stdin", () => {
    const { runtime } = routedRig({ stdout: "" });
    expect(runtime.promptLimit("claude")).toBe(CLAUDE_PROFILE.limits.maxArgBytes.state === "measured" ? CLAUDE_PROFILE.limits.maxArgBytes.value : null);
    expect(runtime.promptLimit("claude")).not.toBeNull();
    expect(runtime.promptLimit("codex")).toBeNull();
    expect(runtime.promptLimit("opencode")).toBeNull();
    expect(runtime.promptLimit("claude", "sdk")).toBeNull();
  });

  test("an instruction one byte over the limit is too-large on instructions with no spawn", async () => {
    const { runtime, specs } = routedRig({ stdout: CLAUDE_STREAM });
    const limit = runtime.promptLimit("claude") ?? 0;
    const result = await runtime.headless("claude", { credential: API_KEY } as never).run({ instructions: "x".repeat(limit + 1), input: "y" });
    expect(!result.ok && result.failure).toMatchObject({ kind: "too-large", field: "instructions" });
    expect(specs).toHaveLength(0);
  });

  test("capabilities returns the driver table or null for an unknown id", () => {
    const { runtime } = routedRig({ stdout: "" });
    expect(runtime.capabilities("claude")).toBe(runtime.driver("claude").capabilities);
    expect(runtime.capabilities("nope" as never)).toBeNull();
  });
});
