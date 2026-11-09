import { describe, expect, test } from "bun:test";
import { ClaudeModel, ClaudeWindow, ClaudeWindowBasis } from "../../src/claude/constants.ts";
import { claudeContextWindow, readClaudeRecords, stripClaudeContextSuffix } from "../../src/claude/index.ts";
import { linesOf, transcriptFiles } from "./support.ts";

const CASES: readonly [string, number, ClaudeWindowBasis][] = [
  ["claude-opus-4-6", 1_000_000, ClaudeWindowBasis.Family],
  ["claude-opus-4.6", 1_000_000, ClaudeWindowBasis.Family],
  ["claude-sonnet-4-10", 1_000_000, ClaudeWindowBasis.Family],
  ["claude-opus-4-5", 200_000, ClaudeWindowBasis.Family],
  ["claude-sonnet-4", 200_000, ClaudeWindowBasis.Family],
  ["claude-opus-3", 200_000, ClaudeWindowBasis.Family],
  ["claude-opus-5", 1_000_000, ClaudeWindowBasis.Family],
  ["claude-sonnet-5-5", 1_000_000, ClaudeWindowBasis.Family],
  ["claude-haiku-5-5", 200_000, ClaudeWindowBasis.Default],
  [ClaudeModel.Synthetic, 200_000, ClaudeWindowBasis.Default],
  ["claude-opus-4-5[1m]", 1_000_000, ClaudeWindowBasis.Suffix],
  ["claude-haiku-4-5[1M]", 1_000_000, ClaudeWindowBasis.Suffix],
];

const CAPTURED: Readonly<Record<string, number>> = {
  "claude-opus-5-5": 1_000_000,
  "claude-sonnet-5": 1_000_000,
  "claude-sonnet-5-5": 1_000_000,
};

describe("claudeContextWindow", () => {
  test.each(CASES)("%s is a %i window on the %s basis", (model, window, basis) => {
    expect(claudeContextWindow(model)).toEqual({ window, basis });
  });

  test("the window sizes are the two Claude sizes", () => {
    expect([...ClaudeWindow.Sizes]).toEqual([200_000, 1_000_000]);
  });

  test("every assistant model id in the captured transcripts is known and gets its expected window", () => {
    const ids = new Set<string>();
    for (const file of transcriptFiles()) {
      for (const record of readClaudeRecords(linesOf(file)).records) {
        if (record.kind === "assistant" && record.model !== null && record.model !== ClaudeModel.Synthetic) {
          ids.add(record.model);
        }
      }
    }
    const windows = [...ids].sort().map((id): [string, number] => [id, claudeContextWindow(id).window]);
    expect(windows).toEqual(Object.entries(CAPTURED).sort(([a], [b]) => a.localeCompare(b)));
  });
});

describe("stripClaudeContextSuffix", () => {
  test("removes a trailing suffix in any case", () => {
    expect(stripClaudeContextSuffix("claude-opus-5-5[1M]")).toBe("claude-opus-5-5");
    expect(stripClaudeContextSuffix("claude-opus-4-6[1m]")).toBe("claude-opus-4-6");
  });

  test("leaves a model without the suffix, or with it in the middle, unchanged", () => {
    expect(stripClaudeContextSuffix("claude-opus-5-5")).toBe("claude-opus-5-5");
    expect(stripClaudeContextSuffix("x[1m]y")).toBe("x[1m]y");
  });
});
