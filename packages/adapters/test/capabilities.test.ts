import { describe, expect, test } from "bun:test";
import { CAPABILITY_NAMES } from "./support/profile-walk.ts";
import { CLAUDE_CAPABILITIES } from "../src/claude/capabilities.ts";
import { CODEX_CAPABILITIES } from "../src/codex/capabilities.ts";
import { OPENCODE_CAPABILITIES } from "../src/opencode/capabilities.ts";
import type { Capabilities } from "../src/core/capability.ts";

const TABLES: Readonly<Record<string, Capabilities>> = {
  claude: CLAUDE_CAPABILITIES,
  codex: CODEX_CAPABILITIES,
  opencode: OPENCODE_CAPABILITIES,
};

const EXPECTED = {
  claude: {
    effort: { cli: { state: "supported" } },
    "structured-output": { cli: { state: "unsupported", reason: "not-implemented" } },
    "sessions-delete": { cli: { state: "unsupported", reason: "not-implemented" } },
    ephemeral: { cli: { state: "supported" } },
    cost: { cli: { state: "supported" } },
    "settings-sources": { cli: { state: "supported" } },
  },
  codex: {
    effort: { cli: { state: "supported" } },
    "structured-output": { cli: { state: "unsupported", reason: "not-implemented" } },
    "sessions-delete": { cli: { state: "unsupported", reason: "not-implemented" } },
    ephemeral: { cli: { state: "supported" } },
    cost: { cli: { state: "unsupported", reason: "harness-limit" } },
    "settings-sources": { cli: { state: "supported" } },
  },
  opencode: {
    effort: { cli: { state: "unmeasured", question: "2.2.6 documents provider/model#variant in --model; is there an effort flag?" } },
    "structured-output": { cli: { state: "unmeasured", question: "does OpenCode 2.2.6 run have a structured output flag?" } },
    "sessions-delete": { cli: { state: "unsupported", reason: "not-implemented" } },
    ephemeral: { cli: { state: "unmeasured", question: "does `session delete` reach a `--standalone` run's session?" } },
    cost: { cli: { state: "unmeasured", question: "committed capture is an error stream; does the real 2.2.6 step_finish carry cost?" } },
    "settings-sources": { cli: { state: "unmeasured", question: "does any OpenCode flag or env skip user config for a headless run?" } },
  },
};

describe("capability tables", () => {
  for (const [harness, table] of Object.entries(TABLES)) {
    test(`${harness} has a cli cell for every capability`, () => {
      expect(Object.keys(table).sort()).toEqual([...CAPABILITY_NAMES].sort());
      for (const name of CAPABILITY_NAMES) {
        expect(Object.keys(table[name as keyof Capabilities])).toEqual(["cli"]);
      }
    });

    test(`${harness} cells carry their reason or question`, () => {
      for (const name of CAPABILITY_NAMES) {
        const cell = table[name as keyof Capabilities].cli;
        if (cell.state === "unsupported") {
          expect(cell.reason.length).toBeGreaterThan(0);
        }
        if (cell.state === "unmeasured") {
          expect(cell.question.endsWith("?")).toBe(true);
        }
      }
    });

    test(`${harness} matches the table in plan 1.3`, () => {
      expect(table).toEqual(EXPECTED[harness as keyof typeof EXPECTED] as unknown as Capabilities);
    });
  }
});
