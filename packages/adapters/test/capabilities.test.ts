import { describe, expect, test } from "bun:test";
import { CAPABILITY_NAMES } from "./support/profile-walk.ts";
import { CLAUDE_CAPABILITIES } from "../src/claude/capabilities.ts";
import { CODEX_CAPABILITIES, CODEX_MCP_NONE_HOW, CODEX_TOOLS_OFF_HOW } from "../src/codex/capabilities.ts";
import {
  OPENCODE_BUILTINS_OFF,
  OPENCODE_CAPABILITIES,
  OPENCODE_EPHEMERAL,
  OPENCODE_MCP_NONE,
  OPENCODE_SETTINGS_SKIP,
} from "../src/opencode/capabilities.ts";
import { AGENT_CELLS, type Capabilities, cell, isUsable, SDK_NOT_BUILT, supported, unsupported, UnsupportedReason } from "../src/core/capability.ts";

const TABLES: Readonly<Record<string, Capabilities>> = {
  claude: CLAUDE_CAPABILITIES,
  codex: CODEX_CAPABILITIES,
  opencode: OPENCODE_CAPABILITIES,
};

const ENGINE_LIMIT = unsupported(UnsupportedReason.EngineLimit);
const NOT_IMPLEMENTED = unsupported(UnsupportedReason.NotImplemented);

describe("capability tables", () => {
  for (const [harness, table] of Object.entries(TABLES)) {
    test(`${harness} has a cell for every capability on both engines`, () => {
      expect(Object.keys(table).sort()).toEqual([...CAPABILITY_NAMES].sort());
      for (const name of CAPABILITY_NAMES) {
        expect(Object.keys(table[name as keyof Capabilities]).sort()).toEqual(["cli", "sdk"]);
      }
    });

    test(`${harness} cells carry their reason, how or question`, () => {
      for (const name of CAPABILITY_NAMES) {
        const support = table[name as keyof Capabilities].cli;
        if (support.state === "unsupported") {
          expect(support.reason.length).toBeGreaterThan(0);
        }
        if (support.state === "unmeasured") {
          expect(support.question.endsWith("?")).toBe(true);
        }
        if (support.state === "emulated") {
          expect(support.how.length).toBeGreaterThan(0);
        }
      }
    });

    test(`${harness} mcp-allowlist is an engine limit on the cli`, () => {
      expect(harness === "claude" ? table["mcp-allowlist"] : table["mcp-allowlist"].cli).toEqual(harness === "claude" ? cell(ENGINE_LIMIT, supported) : ENGINE_LIMIT);
    });

    test(`${harness} has no sdk engine built outside the agent cells`, () => {
      const agent: readonly string[] = AGENT_CELLS;
      for (const name of CAPABILITY_NAMES.filter((candidate) => !agent.includes(candidate))) {
        expect(table[name as keyof Capabilities].sdk).toEqual(SDK_NOT_BUILT);
      }
    });

    test(`${harness} has a usable sdk cell only where an agent engine exists`, () => {
      const agent: readonly string[] = AGENT_CELLS;
      for (const name of CAPABILITY_NAMES) {
        const usable = isUsable(table[name as keyof Capabilities].sdk);
        expect(usable && (harness !== "claude" || !agent.includes(name))).toBe(false);
      }
    });
  }

  test("claude supports the confinement cells", () => {
    for (const name of ["builtin-tools-off", "mcp-none", "settings-sources", "closed-env", "base-url", "ephemeral", "effort", "cost"] as const) {
      expect(CLAUDE_CAPABILITIES[name].cli).toEqual(supported);
    }
    expect(CLAUDE_CAPABILITIES["structured-output"].cli).toEqual(NOT_IMPLEMENTED);
    expect(CLAUDE_CAPABILITIES["sessions-delete"].cli).toEqual(NOT_IMPLEMENTED);
  });

  test("codex emulates tools off and mcp none, and leaves env and base url unmeasured", () => {
    expect(CODEX_CAPABILITIES["builtin-tools-off"].cli).toEqual({ state: "emulated", how: CODEX_TOOLS_OFF_HOW });
    expect(CODEX_CAPABILITIES["mcp-none"].cli).toEqual({ state: "emulated", how: CODEX_MCP_NONE_HOW });
    expect(CODEX_CAPABILITIES["settings-sources"].cli).toEqual(supported);
    expect(CODEX_CAPABILITIES["closed-env"].cli.state).toBe("unmeasured");
    expect(CODEX_CAPABILITIES["base-url"].cli.state).toBe("unmeasured");
    expect(CODEX_CAPABILITIES.cost.cli).toEqual(unsupported(UnsupportedReason.HarnessLimit));
  });

  test("opencode cells are the named constants, so one line flips each", () => {
    expect(OPENCODE_CAPABILITIES["builtin-tools-off"].cli).toBe(OPENCODE_BUILTINS_OFF);
    expect(OPENCODE_CAPABILITIES["mcp-none"].cli).toBe(OPENCODE_MCP_NONE);
    expect(OPENCODE_CAPABILITIES["settings-sources"].cli).toBe(OPENCODE_SETTINGS_SKIP);
    expect(OPENCODE_CAPABILITIES.ephemeral.cli).toBe(OPENCODE_EPHEMERAL);
  });

  test("the agent cells are capability names", () => {
    for (const name of AGENT_CELLS) {
      expect(CAPABILITY_NAMES).toContain(name);
    }
  });
});
