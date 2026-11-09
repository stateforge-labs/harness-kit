import { describe, expect, test } from "bun:test";
import { CapabilityName, SupportState } from "../../src/core/capability.ts";
import { TOOLS_DEFAULT, TOOLS_OFF, type ToolPolicy } from "../../src/core/policy.ts";
import { secret } from "../../src/core/secret.ts";
import { OPENCODE_BASE_URL, OPENCODE_BUILTINS_OFF, OPENCODE_CAPABILITIES, OPENCODE_CLOSED_ENV, OPENCODE_EPHEMERAL, OPENCODE_MCP_NONE, OPENCODE_SETTINGS_SKIP } from "../../src/opencode/capabilities.ts";
import { OpenCodeToolsOffLeftovers } from "../../src/opencode/constants.ts";
import { EnvVar } from "../../src/env.ts";
import { OPENCODE_STREAM, routedRig } from "../runtime/support.ts";

const REQUEST = { instructions: "x", input: "y" };
const LOGIN = { mode: "login-store" } as never;
const API_KEY = { mode: "api-key", provider: "openai", key: secret("sk-CONFINE") } as never;

describe("opencode confinement cells", () => {
  test("each cell is exactly its named constant, so one line flips it", () => {
    expect(OPENCODE_CAPABILITIES[CapabilityName.BuiltinToolsOff].cli).toBe(OPENCODE_BUILTINS_OFF);
    expect(OPENCODE_CAPABILITIES[CapabilityName.McpNone].cli).toBe(OPENCODE_MCP_NONE);
    expect(OPENCODE_CAPABILITIES[CapabilityName.SettingsSources].cli).toBe(OPENCODE_SETTINGS_SKIP);
    expect(OPENCODE_CAPABILITIES[CapabilityName.Ephemeral].cli).toBe(OPENCODE_EPHEMERAL);
    expect(OPENCODE_CAPABILITIES[CapabilityName.ClosedEnv].cli).toBe(OPENCODE_CLOSED_ENV);
    expect(OPENCODE_CAPABILITIES[CapabilityName.BaseUrl].cli).toBe(OPENCODE_BASE_URL);
  });

  test("tools off is emulated and its evidence names the measured version, the date and every leftover tool", () => {
    expect(OPENCODE_BUILTINS_OFF.state).toBe(SupportState.Emulated);
    const how = OPENCODE_BUILTINS_OFF.state === SupportState.Emulated ? OPENCODE_BUILTINS_OFF.how : "";
    expect(how).toContain("v2.2.6");
    expect(how).toContain("2026-11-09");
    for (const leftover of OpenCodeToolsOffLeftovers) {
      expect(how).toContain(leftover);
    }
  });

  test("settings skip and ephemeral are emulated with the measured version and date, mcp none stays a question", () => {
    for (const support of [OPENCODE_SETTINGS_SKIP, OPENCODE_EPHEMERAL]) {
      expect(support.state).toBe(SupportState.Emulated);
      const how = support.state === SupportState.Emulated ? support.how : "";
      expect(how).toContain("v2.2.6");
      expect(how).toContain("2026-11-09");
    }
    expect(OPENCODE_MCP_NONE.state).toBe(SupportState.Unmeasured);
    expect(OPENCODE_MCP_NONE.state === SupportState.Unmeasured && OPENCODE_MCP_NONE.question.endsWith("?")).toBe(true);
  });

  test("closed env and base url stay unmeasured questions", () => {
    for (const support of [OPENCODE_CLOSED_ENV, OPENCODE_BASE_URL]) {
      expect(support.state).toBe(SupportState.Unmeasured);
      expect(support.state === SupportState.Unmeasured && support.question.endsWith("?")).toBe(true);
    }
  });
});

describe("opencode plan and run through the runtime", () => {
  test("a plan with TOOLS_OFF lists the three cells with their supports and names the config env only by name", () => {
    const { runtime } = routedRig({ stdout: "" });
    const planned = runtime.headless("opencode", { credential: LOGIN, tools: TOOLS_OFF } as never).plan(REQUEST);
    expect(planned.ok).toBe(true);
    if (!planned.ok || planned.value.engine !== "cli") {
      throw new Error("expected a cli plan");
    }
    expect(planned.value.confinement.map((c) => [c.capability, c.support])).toEqual([
      [CapabilityName.BuiltinToolsOff, OPENCODE_BUILTINS_OFF],
      [CapabilityName.McpNone, OPENCODE_MCP_NONE],
      [CapabilityName.SettingsSources, OPENCODE_SETTINGS_SKIP],
    ]);
    expect(planned.value.env.set).toEqual(expect.arrayContaining([EnvVar.OpenCodeConfigContent, "OPENCODE_CONFIG_DIR"]));
    expect(planned.value.args).toContain("--standalone");
    expect(planned.value.args).not.toContain("--pure");
  });

  test("strict tools off is refused as unsupported builtin-tools-off with the cell and no run spawn", async () => {
    const { runtime, specs } = routedRig({ stdout: "" });
    const strict: ToolPolicy = { ...TOOLS_OFF, strict: true };
    const result = await runtime.headless("opencode", { credential: LOGIN, tools: strict } as never).run(REQUEST);
    expect(!result.ok && result.failure).toMatchObject({ kind: "unsupported", capability: CapabilityName.BuiltinToolsOff, support: OPENCODE_BUILTINS_OFF });
    expect(specs).toHaveLength(0);
  });

  test("strict mcp none is refused as unmeasured and no run spawn", async () => {
    const { runtime, specs } = routedRig({ stdout: "" });
    const tools: ToolPolicy = { ...TOOLS_DEFAULT, mcp: [], strict: true };
    const result = await runtime.headless("opencode", { credential: LOGIN, tools } as never).run(REQUEST);
    expect(!result.ok && result.failure).toMatchObject({ kind: "unsupported", capability: CapabilityName.McpNone, support: { state: "unmeasured" } });
    expect(specs).toHaveLength(0);
  });

  test("a non-strict TOOLS_OFF run applies the mechanism whatever the cells say", async () => {
    const { runtime, specs } = routedRig({ stdout: OPENCODE_STREAM });
    const result = await runtime.headless("opencode", { credential: API_KEY, tools: TOOLS_OFF } as never).run(REQUEST);
    expect(result.ok).toBe(true);
    const run = specs.find((spec) => spec.args.includes("--title"));
    expect(run?.args).toContain("--standalone");
    expect(run?.env[EnvVar.OpenCodeConfigContent]).toContain("\"permissions\"");
    expect(run?.env["OPENCODE_DISABLE_PROJECT_CONFIG"]).toBe("1");
    expect(run?.env["OPENCODE_DISABLE_CLAUDE_CODE"]).toBe("1");
    expect(run?.env["OPENCODE_CONFIG_DIR"]).toBeDefined();
    expect(run?.env["OPENCODE_CONFIG_DIR"]).not.toBe("{config-dir}");
    expect(result.ok && result.value.confinement).toHaveLength(3);
  });

  test("persist false is accepted because the session is deleted after the run", async () => {
    const { runtime, specs } = routedRig({ stdout: OPENCODE_STREAM });
    const result = await runtime.headless("opencode", { credential: API_KEY, persist: false } as never).run(REQUEST);
    expect(result.ok).toBe(true);
    expect(specs.some((spec) => spec.args[0] === "session" && spec.args[1] === "delete" && spec.args.includes("--standalone"))).toBe(true);
  });

  test("closed env is unsupported with no spawn", async () => {
    const { runtime, specs } = routedRig({ stdout: "" });
    const result = await runtime.headless("opencode", { credential: API_KEY, env: { kind: "closed", set: { PATH: "/bin" } } } as never).run(REQUEST);
    expect(!result.ok && result.failure).toMatchObject({ kind: "unsupported", capability: CapabilityName.ClosedEnv });
    expect(specs.filter((spec) => spec.args.includes("--title"))).toHaveLength(0);
  });

  test("a baseUrl on an api-key credential is unsupported with no spawn", async () => {
    const { runtime, specs } = routedRig({ stdout: "" });
    const credential = { mode: "api-key", provider: "openai", key: secret("sk-CONFINE"), baseUrl: "https://example.invalid" } as never;
    const result = await runtime.headless("opencode", { credential } as never).run(REQUEST);
    expect(!result.ok && result.failure).toMatchObject({ kind: "unsupported", capability: CapabilityName.BaseUrl });
    expect(specs.filter((spec) => spec.args.includes("--title"))).toHaveLength(0);
  });
});
