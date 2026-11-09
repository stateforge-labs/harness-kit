import { describe, expect, test } from "bun:test";
import { CapabilityName, cell, emulated, supported, unmeasuredSupport, unsupported, UnsupportedReason, type Capabilities } from "../../src/core/capability.ts";
import { confine, DEFAULT_TOOLS, McpWhy, resolveTools, TOOLS_DEFAULT, TOOLS_OFF, type McpEndpoint, type ResolvedTools } from "../../src/core/policy.ts";
import { secret } from "../../src/core/secret.ts";
import { FAKE_CAPABILITIES } from "../support/fake-driver.ts";

const CAPS: Capabilities = {
  ...FAKE_CAPABILITIES,
  [CapabilityName.BuiltinToolsOff]: cell(emulated("a sandbox")),
  [CapabilityName.McpNone]: cell(supported),
  [CapabilityName.SettingsSources]: cell(unmeasuredSupport("does it skip settings?")),
};
const ENDPOINT: McpEndpoint = { name: "docs", url: "https://example.test/mcp", bearer: null, allow: ["search"] };

function resolved(over: Partial<ResolvedTools> = {}): ResolvedTools {
  return { ...resolveTools(TOOLS_OFF, undefined), ...over };
}

describe("resolveTools", () => {
  test("the call wins over the consumer, which wins over the default", () => {
    expect(resolveTools(TOOLS_OFF, TOOLS_DEFAULT)).toEqual({ ...TOOLS_OFF, strict: false });
    expect(resolveTools(undefined, TOOLS_OFF)).toEqual({ ...TOOLS_OFF, strict: false });
    expect(resolveTools(undefined, undefined)).toEqual({ ...DEFAULT_TOOLS, strict: false });
  });

  test("strict defaults to false and is kept when set", () => {
    expect(resolveTools({ ...TOOLS_OFF, strict: true }, undefined).strict).toBe(true);
    expect(resolveTools({ builtins: "off", mcp: [], settings: "none" }, undefined).strict).toBe(false);
  });
});

describe("confine", () => {
  test("harness defaults produce no cell", () => {
    expect(confine(resolveTools(TOOLS_DEFAULT, undefined), CAPS, "cli")).toEqual({ ok: true, value: [] });
  });

  test("tools off lists the three axes in order with their support", () => {
    const result = confine(resolved(), CAPS, "cli");
    expect(result.ok && result.value.map((c) => [c.axis, c.capability, c.support.state, c.requested])).toEqual([
      ["builtins", "builtin-tools-off", "emulated", "off"],
      ["mcp", "mcp-none", "supported", "none"],
      ["settings", "settings-sources", "unmeasured", "none"],
    ]);
  });

  test("strict refuses an emulated cell and carries its support", () => {
    const result = confine(resolved({ strict: true }), CAPS, "cli");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.failure).toMatchObject({ kind: "unsupported", capability: "builtin-tools-off", engine: "cli", support: { state: "emulated" } });
  });

  test("strict refuses an unmeasured cell", () => {
    const only = resolved({ builtins: "harness-default", mcp: "harness-default", strict: true });
    const result = confine(only, CAPS, "cli");
    expect(!result.ok && result.failure).toMatchObject({ capability: "settings-sources", support: { state: "unmeasured" } });
  });

  test("an unsupported cell is refused even when not strict", () => {
    const caps: Capabilities = { ...CAPS, [CapabilityName.McpNone]: cell(unsupported(UnsupportedReason.EngineLimit)) };
    const result = confine(resolved(), caps, "cli");
    expect(!result.ok && result.failure).toMatchObject({ capability: "mcp-none", why: "engine-limit" });
  });

  test("an mcp endpoint on the cli is unsupported, with the bearer reason when a bearer is given", () => {
    const withBearer = confine(resolved({ builtins: "harness-default", settings: "harness-default", mcp: [{ ...ENDPOINT, bearer: secret("tok-SENTINEL") }] }), CAPS, "cli");
    expect(!withBearer.ok && withBearer.failure).toMatchObject({ kind: "unsupported", capability: "mcp-allowlist", why: McpWhy.BearerNotInArgv });
    expect(JSON.stringify(withBearer)).not.toContain("tok-SENTINEL");
    const plain = confine(resolved({ builtins: "harness-default", settings: "harness-default", mcp: [ENDPOINT] }), CAPS, "cli");
    expect(!plain.ok && plain.failure).toMatchObject({ capability: "mcp-allowlist", why: McpWhy.CliCannotHostEndpoint });
  });
});
