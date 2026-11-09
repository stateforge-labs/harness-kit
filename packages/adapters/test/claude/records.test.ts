import { describe, expect, test } from "bun:test";
import { ClaudeNoise, ClaudeSubtype } from "../../src/claude/constants.ts";
import {
  awaySummary,
  compactBoundary,
  compactSummary,
  compactionFailed,
  humanPrompt,
  parseClaudeRecord,
  readClaudeRecords,
  unwrapPastedContent,
  type ClaudeRecord,
} from "../../src/claude/index.ts";
import { ClaudeAttachmentKind, ClaudeRecordKind, ClaudeSystemSubtype } from "../../src/claude/enums.ts";
import { join } from "node:path";
import { adaptersFixtures } from "../support/fixtures.ts";
import { COMPACT, PASTED, SIDECHAIN, linesOf, respaced, transcriptFiles } from "./support.ts";

const RULES = join(adaptersFixtures, "claude", "synthetic", "rules.jsonl");

const line = (value: unknown): string => JSON.stringify(value);

describe("the captured transcripts", () => {
  test("every non-blank line parses, with no unknown type and no enum issue", () => {
    for (const file of transcriptFiles()) {
      const { records, unknown, issues } = readClaudeRecords(linesOf(file));
      expect([file, [...unknown.byType]]).toEqual([file, []]);
      expect([file, issues]).toEqual([file, []]);
      expect(records.length).toBeGreaterThan(0);
    }
  });

  test("the compact boundary carries the captured figures", () => {
    const { records } = readClaudeRecords(linesOf(COMPACT));
    const boundaries = records.flatMap((record) => {
      const compact = compactBoundary(record);
      return compact === null ? [] : [compact];
    });
    expect(boundaries).toEqual([{ preTokens: 109870, postTokens: 15185, durationMs: 40455, trigger: "manual" }]);
  });

  test("pasted content is unwrapped in human prompts", () => {
    const prompts = readClaudeRecords(linesOf(PASTED)).records.flatMap((record) => {
      const prompt = humanPrompt(record);
      return prompt === null ? [] : [prompt];
    });
    expect(prompts.length).toBeGreaterThan(0);
    for (const prompt of prompts) {
      expect(prompt.includes("<pasted_content")).toBe(false);
      expect(prompt.startsWith("\n")).toBe(false);
    }
  });

  test("sidechain records never yield a human prompt or a tool use", () => {
    const { records } = readClaudeRecords(linesOf(SIDECHAIN));
    const sidechain = records.filter((record) => record.sidechain);
    expect(sidechain.length).toBe(25);
    expect(records.filter((record) => !record.sidechain).every((record) => record.kind === "passthrough")).toBe(true);
    expect(records.filter((record) => humanPrompt(record) !== null)).toEqual([]);
  });
});

describe("parseClaudeRecord", () => {
  test("a blank line is not json", () => {
    expect(parseClaudeRecord("  ")).toEqual({ ok: false, reason: "not-json", type: null, row: null });
  });

  test("an untyped or unknown top-level type is unknown", () => {
    expect(parseClaudeRecord(line({ type: "progress" })).ok).toBe(false);
    expect(parseClaudeRecord(line({ no: "type" }))).toMatchObject({ ok: false, reason: "unknown-type", type: null });
  });

  test("an unseen system subtype is kept as a string and reported as an issue", () => {
    const parsed = parseClaudeRecord(line({ type: "system", subtype: "novel_thing", timestamp: "2026-11-01T00:00:00Z" }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.record).toMatchObject({ kind: "system", subtype: "novel_thing", at: Date.parse("2026-11-01T00:00:00Z") });
    expect(parsed.issues).toEqual([
      { harness: "claude", record: "system", path: "subtype", got: "novel_thing", expected: ClaudeSystemSubtype.options.join("|") },
    ]);
  });

  test("an unseen block type is an other block and reported", () => {
    const parsed = parseClaudeRecord(line({ type: "assistant", message: { content: [{ type: "hologram" }] } }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.record).toMatchObject({ kind: "assistant", blocks: [{ kind: "other", blockType: "hologram" }] });
    expect(parsed.issues).toHaveLength(1);
  });

  test("a queued attachment with an unseen origin is reported", () => {
    const parsed = parseClaudeRecord(line({ type: "attachment", attachment: { type: "queued_command", origin: { kind: "robot" } } }));
    expect(parsed.ok).toBe(true);
    expect(ClaudeAttachmentKind.safeParse("queued_command").success).toBe(true);
    expect(ClaudeRecordKind.safeParse("attachment").success).toBe(true);
    if (parsed.ok) {
      expect(parsed.issues.map((issue) => issue.path)).toEqual(["attachment.origin.kind"]);
    }
  });
});

describe("prompt unwrapping and noise", () => {
  test("pasted content unwraps with or without a closing id", () => {
    expect(unwrapPastedContent('\n\n<pasted_content id="a1">\nhello\nworld\n</pasted_content>\n')).toBe("hello\nworld");
    expect(unwrapPastedContent('<pasted_content id="a1">\nhi\n</pasted_content id="a1">')).toBe("hi");
    expect(unwrapPastedContent("plain text")).toBe("plain text");
  });

  test("a noise user prompt is not a human prompt", () => {
    const parsed = parseClaudeRecord(line({ type: "user", message: { content: "<command-name>/clear</command-name>" } }));
    expect(parsed.ok && humanPrompt(parsed.record)).toBeNull();
    expect(ClaudeNoise.Prefixes).toContain("<system-reminder");
  });

  test("a queued human attachment is a human prompt, a task notification is not", () => {
    const human = parseClaudeRecord(line({ type: "attachment", attachment: { type: "queued_command", prompt: "ship it", origin: { kind: "human" } } }));
    const notice = parseClaudeRecord(line({ type: "attachment", attachment: { type: "queued_command", prompt: "x", origin: { kind: "task-notification" } } }));
    expect(human.ok && humanPrompt(human.record)).toBe("ship it");
    expect(notice.ok && humanPrompt(notice.record)).toBeNull();
  });
});

describe("synthetic rules without a capture", () => {
  test("the synthetic rules file parses with no unknown and no issues", () => {
    const { records, unknown, issues } = readClaudeRecords(linesOf(RULES));
    expect(records).toHaveLength(3);
    expect([...unknown.byType]).toEqual([]);
    expect(issues).toEqual([]);
    expect(awaySummary(records[0] as ClaudeRecord)).toBe("Refactoring the adapters.");
    expect(compactionFailed(records[1] as ClaudeRecord)).toBe(true);
    expect(compactSummary(records[2] as ClaudeRecord)).toBe("Summary body");
  });

  const away = parseClaudeRecord(line({ type: "system", subtype: ClaudeSubtype.AwaySummary, content: "Refactoring the adapters." }));
  const failed = parseClaudeRecord(
    line({ type: "system", subtype: ClaudeSubtype.LocalCommand, content: `Error during compaction ${ClaudeNoise.LocalStderr}boom` }),
  );
  const stderrOnly = parseClaudeRecord(line({ type: "user", message: { content: `Error during compaction ${ClaudeNoise.LocalStderr}` } }));
  const plainMention = parseClaudeRecord(line({ type: "user", message: { content: "Error during compaction is a term" } }));
  const summary = parseClaudeRecord(line({ type: "user", isCompactSummary: true, message: { content: "  Summary body  " } }));

  const record = (parsed: ReturnType<typeof parseClaudeRecord>): ClaudeRecord => {
    if (!parsed.ok) {
      throw new Error("record did not parse");
    }
    return parsed.record;
  };

  test("the away summary is the system content", () => {
    expect(awaySummary(record(away))).toBe("Refactoring the adapters.");
  });

  test("a compaction failure is a local command or carries the stderr tag", () => {
    expect(compactionFailed(record(failed))).toBe(true);
    expect(compactionFailed(record(stderrOnly))).toBe(true);
    expect(compactionFailed(record(plainMention))).toBe(false);
  });

  test("the compact summary is trimmed", () => {
    expect(compactSummary(record(summary))).toBe("Summary body");
  });
});

describe("the spaced json variant", () => {
  test("the same records come out of a spaced serialisation", () => {
    const original = readClaudeRecords(linesOf(COMPACT));
    const variant = readClaudeRecords(respaced(linesOf(COMPACT)));
    expect(variant.records.map((record: ClaudeRecord) => record.kind)).toEqual(original.records.map((record) => record.kind));
    expect(variant.records.flatMap((record) => compactBoundary(record) ?? [])).toEqual(original.records.flatMap((record) => compactBoundary(record) ?? []));
    expect(variant.issues).toEqual(original.issues);
  });
});
