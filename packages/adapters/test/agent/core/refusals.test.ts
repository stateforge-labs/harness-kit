import { describe, expect, test } from "bun:test";
import { CapabilityName, emulated, unsupported, UnsupportedReason } from "../../../src/core/capability.ts";
import type { AgentOptions } from "../../../src/agent/types.ts";
import { AgentWhy } from "../../../src/runtime/index.ts";
import { secret } from "../../../src/core/secret.ts";
import { TOOLS_OFF } from "../../../src/core/policy.ts";
import { agentOf, collect, DIRS, failureOf, finishedOf, ID, options, rig, sdkCapabilities, startOf } from "./support.ts";

const refused = (opts: unknown, extra: Parameters<typeof rig>[1] = {}) => rig([{}], extra).runtime.agent(ID, opts as AgentOptions);

describe("refusals by value before any spawn", () => {
  test("the cli engine is unsupported on the engine capability", () => {
    const result = refused({ ...options, engine: "cli" });
    expect(result.ok).toBe(false);
    if (!result.ok && result.failure.kind === "unsupported") {
      expect(result.failure.capability).toBe("engine");
      expect(result.failure.why).toBe(AgentWhy.CliEngine);
    } else {
      throw new Error("expected unsupported");
    }
  });

  test("an inherited environment is invalid-config on env", () => {
    const result = refused({ ...options, env: { kind: "inherit" } });
    expect(!result.ok && result.failure.kind === "invalid-config" && result.failure.field === "env").toBe(true);
  });

  test("an empty or missing base url is invalid-config", () => {
    for (const baseUrl of ["", "  ", undefined]) {
      const result = refused({ ...options, credential: { mode: "api-key", key: secret("k"), baseUrl } });
      expect(!result.ok && result.failure.kind === "invalid-config" && result.failure.field === "credential.baseUrl").toBe(true);
    }
  });

  test("any other credential mode is credential-unsupported", () => {
    const result = refused({ ...options, credential: { mode: "login-store" } });
    expect(!result.ok && result.failure.kind === "credential-unsupported").toBe(true);
  });

  test("allowedModes without api-key refuses with mode-not-allowed", () => {
    const result = refused(options, { allowedModes: ["token"] });
    expect(!result.ok && result.failure.kind === "credential-unsupported" && result.failure.reason === "mode-not-allowed").toBe(true);
  });

  test("a key that is not a secret is a credential failure", () => {
    const result = refused({ ...options, credential: { mode: "api-key", key: "plain", baseUrl: "http://x" } });
    expect(!result.ok && result.failure.kind === "credential").toBe(true);
  });

  test("mcp that is not an endpoint list is invalid-config", () => {
    for (const mcp of ["harness-default", undefined]) {
      const result = refused({ ...options, tools: { ...TOOLS_OFF, mcp } });
      expect(!result.ok && result.failure.kind === "invalid-config" && result.failure.field === "tools.mcp").toBe(true);
    }
  });

  test("an endpoint allow list with built-in tools on is invalid-config on tools.builtins", () => {
    const endpoint = { name: "docs", url: "http://127.0.0.1:1/mcp", bearer: null, allow: ["search"] };
    const on = refused({ ...options, tools: { ...TOOLS_OFF, builtins: "harness-default", mcp: [endpoint] } });
    expect(!on.ok && on.failure.kind === "invalid-config" && on.failure.field === "tools.builtins").toBe(true);
    const off = refused({ ...options, tools: { ...TOOLS_OFF, mcp: [endpoint] } });
    expect(off.ok).toBe(true);
    const open = refused({ ...options, tools: { ...TOOLS_OFF, builtins: "harness-default", mcp: [{ ...endpoint, allow: [] }] } });
    expect(open.ok).toBe(true);
  });

  test("a relative directory is invalid-config on that directory", () => {
    const result = refused({ ...options, dirs: { ...DIRS, home: "home" } });
    expect(!result.ok && result.failure.kind === "invalid-config" && result.failure.field === "dirs.home").toBe(true);
  });

  test("a bad timeout is invalid-config", () => {
    const result = refused({ ...options, timeoutMs: 0 });
    expect(!result.ok && result.failure.kind === "invalid-config" && result.failure.field === "timeoutMs").toBe(true);
  });

  test("an unsupported confinement cell is unsupported", () => {
    const caps = sdkCapabilities({ [CapabilityName.BuiltinToolsOff]: unsupported(UnsupportedReason.EngineLimit) });
    const result = refused(options, { caps });
    expect(!result.ok && result.failure.kind === "unsupported" && result.failure.capability === "builtin-tools-off").toBe(true);
  });

  test("an emulated cell passes, and is refused when strict", () => {
    const caps = sdkCapabilities({ [CapabilityName.BuiltinToolsOff]: emulated("by hand") });
    expect(refused(options, { caps }).ok).toBe(true);
    const strict = refused({ ...options, tools: { ...TOOLS_OFF, strict: true } }, { caps });
    expect(!strict.ok && strict.failure.kind === "unsupported").toBe(true);
  });

  test("an unsupported closed-env or base-url cell is unsupported", () => {
    for (const name of [CapabilityName.ClosedEnv, CapabilityName.BaseUrl]) {
      const caps = sdkCapabilities({ [name]: unsupported(UnsupportedReason.EngineLimit) });
      const result = refused(options, { caps });
      expect(!result.ok && result.failure.kind === "unsupported" && result.failure.capability === name).toBe(true);
    }
  });

  test("an unknown harness is unknown-harness", () => {
    const result = rig([{}]).runtime.agent("other" as never, options);
    expect(!result.ok && result.failure.kind === "unknown-harness").toBe(true);
  });

  test("a closed runtime refuses", async () => {
    const r = rig([{}]);
    await r.runtime.close();
    const result = r.runtime.agent(ID, options);
    expect(!result.ok && result.failure.kind === "unavailable").toBe(true);
  });
});

describe("refusals at start are finished events, never throws", () => {
  const cases: readonly [string, Parameters<typeof startOf>[0], string][] = [
    ["maxTurns zero", { maxTurns: 0 }, "maxTurns"],
    ["maxTurns fractional", { maxTurns: 1.5 }, "maxTurns"],
    ["maxTurns missing", { maxTurns: undefined as never }, "maxTurns"],
    ["an output schema that is an array", { outputSchema: [] as never }, "outputSchema"],
    ["an empty recovery prompt", { resume: { sessionId: "s" as never, recoveryPrompt: "" } }, "resume.recoveryPrompt"],
    ["an empty resume session", { resume: { sessionId: "" as never } }, "resume.sessionId"],
    ["a bad mcp limit", { limits: { mcpOutputTokens: -1 } }, "limits.mcpOutputTokens"],
    ["a zero mcp limit", { limits: { mcpOutputTokens: 0 } }, "limits.mcpOutputTokens"],
    ["a fractional mcp limit", { limits: { mcpOutputTokens: 1.5 } }, "limits.mcpOutputTokens"],
  ];
  for (const [label, extra, field] of cases) {
    test(label, async () => {
      const r = rig([{}]);
      const run = agentOf(r).start(startOf(extra));
      const failure = failureOf(finishedOf(await collect(run.events)));
      expect(failure.kind === "invalid-config" && failure.field === field).toBe(true);
      expect(failureOf(await run.settled)).toEqual(failure);
      expect(r.engine.starts).toHaveLength(0);
    });
  }

  test("a missing directory names the directory and creates nothing", async () => {
    const r = rig([{}], { dirs: [DIRS.home, DIRS.configDir, DIRS.tmpDir] });
    const failure = failureOf(await agentOf(r).start(startOf()).settled);
    expect(failure.kind === "invalid-config" && failure.field === "dirs.cwd").toBe(true);
    expect(r.engine.starts).toHaveLength(0);
  });

  test("a cell the start needs but the sdk lacks is unsupported", async () => {
    const caps = sdkCapabilities({ [CapabilityName.SessionStore]: unsupported(UnsupportedReason.HarnessLimit), [CapabilityName.StructuredOutput]: unsupported(UnsupportedReason.NotImplemented) });
    const r = rig([{}], { caps });
    const store = { append: async () => {}, load: async () => null, listSubkeys: async () => [] };
    const withStore = failureOf(await agentOf(r).start(startOf({ store })).settled);
    expect(withStore.kind === "unsupported" && withStore.capability === "session-store").toBe(true);
    const withSchema = failureOf(await agentOf(r).start(startOf({ outputSchema: { type: "object" } })).settled);
    expect(withSchema.kind === "unsupported" && withSchema.capability === "structured-output").toBe(true);
    expect(r.engine.starts).toHaveLength(0);
  });

  test("a describe failure ends the run before the engine starts", async () => {
    const r = rig([{ describe: { ok: false, failure: { kind: "invalid-config", message: "bad plan", field: "x" } } }]);
    const failure = failureOf(await agentOf(r).start(startOf()).settled);
    expect(failure.kind === "invalid-config" && failure.field === "x").toBe(true);
    expect(r.engine.starts).toHaveLength(0);
  });
});
