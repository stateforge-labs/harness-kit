import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { ClaudeModel } from "../../src/claude/constants.ts";
import { claudeContextUse, readClaudeRecords, type ClaudeRecord } from "../../src/claude/index.ts";
import { adaptersFixtures } from "../support/fixtures.ts";
import { BACKGROUND, COMPACT, SIDECHAIN, fixtureFile, linesOf, transcriptFiles } from "./support.ts";

const SYNTHETIC_ONLY = join(adaptersFixtures, "claude", "synthetic", "usage.jsonl");
const ROOT = fixtureFile("-home-user", "00000000-0000-4000-8000-00000000013b.jsonl");

type RawRow = { readonly type?: string; readonly isSidechain?: boolean; readonly message?: { readonly model?: string; readonly usage?: Record<string, number> } };

const rawRows = (path: string): RawRow[] => linesOf(path).filter((line) => line.trim() !== "").map((line) => JSON.parse(line) as RawRow);

const rawTokens = (row: RawRow): number | null => {
  const usage = row.message?.usage;
  if (row.type !== "assistant" || row.isSidechain === true || row.message?.model === ClaudeModel.Synthetic || usage === undefined || Object.keys(usage).length === 0) {
    return null;
  }
  return (usage["input_tokens"] ?? 0) + (usage["cache_read_input_tokens"] ?? 0) + (usage["cache_creation_input_tokens"] ?? 0);
};

const rawQualifying = (path: string): { tokens: number; model: string | undefined }[] =>
  rawRows(path).flatMap((row) => {
    const tokens = rawTokens(row);
    return tokens === null ? [] : [{ tokens, model: row.message?.model }];
  });

const recordsOf = (path: string): ClaudeRecord[] => readClaudeRecords(linesOf(path)).records;

describe("claudeContextUse on the captured transcripts", () => {
  test("the final assistant of the background transcript gives input, cache read and cache write", () => {
    const last = rawQualifying(BACKGROUND).at(-1);
    expect(last).toEqual({ tokens: 404516, model: "claude-opus-5-5" });
    expect(claudeContextUse(recordsOf(BACKGROUND))).toEqual({ tokens: 404516, peakTokens: 404516, model: "claude-opus-5-5" });
  });

  test("a compact boundary replaces the tokens with its post count and keeps the previous model", () => {
    expect(claudeContextUse(recordsOf(COMPACT))).toEqual({ tokens: 15185, peakTokens: 109870, model: "claude-sonnet-5-5" });
  });

  test("synthetic replies are skipped, so the last real reply is the context", () => {
    const real = rawQualifying(ROOT);
    const peak = Math.max(...real.map((entry) => entry.tokens));
    expect(real.at(-1)).toEqual({ tokens: 59044, model: "claude-sonnet-5" });
    expect(claudeContextUse(recordsOf(ROOT))).toEqual({ tokens: 59044, peakTokens: peak, model: "claude-sonnet-5" });
  });

  test("a sidechain-only transcript gives no context", () => {
    expect(claudeContextUse(recordsOf(SIDECHAIN))).toBeNull();
  });

  test("a synthetic reply and a compact boundary without a post count give no context", () => {
    expect(claudeContextUse(recordsOf(SYNTHETIC_ONLY))).toBeNull();
  });

  test("every captured transcript has a peak at least as large as its tokens", () => {
    for (const file of transcriptFiles()) {
      const use = claudeContextUse(recordsOf(file));
      if (use !== null) {
        expect([file, use.peakTokens >= use.tokens]).toEqual([file, true]);
      }
    }
  });
});
