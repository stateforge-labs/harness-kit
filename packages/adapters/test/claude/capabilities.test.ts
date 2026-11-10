import { describe, expect, test } from "bun:test";
import { CLAUDE_CAPABILITIES } from "../../src/claude/capabilities.ts";
import { AGENT_CELLS, CapabilityName, cell, SDK_NOT_BUILT, supported, unsupported, UnsupportedReason, type Capabilities } from "../../src/core/capability.ts";

const NOT_IMPLEMENTED = unsupported(UnsupportedReason.NotImplemented);

const EXPECTED_CLI: Readonly<Record<keyof Capabilities, (typeof supported) | ReturnType<typeof unsupported>>> = {
  [CapabilityName.Effort]: supported,
  [CapabilityName.StructuredOutput]: NOT_IMPLEMENTED,
  [CapabilityName.SessionsDelete]: NOT_IMPLEMENTED,
  [CapabilityName.Ephemeral]: supported,
  [CapabilityName.Cost]: supported,
  [CapabilityName.SettingsSources]: supported,
  [CapabilityName.BuiltinToolsOff]: supported,
  [CapabilityName.McpNone]: supported,
  [CapabilityName.McpAllowlist]: unsupported(UnsupportedReason.EngineLimit),
  [CapabilityName.ClosedEnv]: supported,
  [CapabilityName.BaseUrl]: supported,
  [CapabilityName.Resume]: SDK_NOT_BUILT,
  [CapabilityName.ResumeCheckpoint]: SDK_NOT_BUILT,
  [CapabilityName.PerTurnUsage]: SDK_NOT_BUILT,
  [CapabilityName.UnknownToolDetection]: SDK_NOT_BUILT,
  [CapabilityName.SessionStore]: SDK_NOT_BUILT,
};

describe("claude capabilities", () => {
  for (const [name, expected] of Object.entries(EXPECTED_CLI)) {
    test(`${name} on the cli`, () => {
      expect(CLAUDE_CAPABILITIES[name as keyof Capabilities].cli).toEqual(expected);
    });
  }

  test("the sdk column is supported for the agent cells and not built for the rest", () => {
    const agent: readonly string[] = AGENT_CELLS;
    for (const name of Object.values(CapabilityName)) {
      expect(CLAUDE_CAPABILITIES[name].sdk).toEqual(agent.includes(name) ? supported : SDK_NOT_BUILT);
    }
  });

  test("the table covers exactly the contract names", () => {
    expect(Object.keys(CLAUDE_CAPABILITIES).sort()).toEqual(Object.keys(EXPECTED_CLI).sort());
    expect(CLAUDE_CAPABILITIES[CapabilityName.McpAllowlist]).toEqual(cell(unsupported(UnsupportedReason.EngineLimit), supported));
  });
});
