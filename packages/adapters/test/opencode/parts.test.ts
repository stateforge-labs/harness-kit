import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { humanText, isToolInFlight, parseMessage, parsePart, type OpenCodePart } from "../../src/opencode/parts.ts";
import { obj, str, type Row } from "../../src/core/rows.ts";
import { adaptersFixtures } from "../support/fixtures.ts";

const base = join(adaptersFixtures, "opencode");
const tables = JSON.parse(readFileSync(join(base, "rows-v1.json"), "utf8")) as { readonly session: readonly Row[]; readonly message: readonly Row[]; readonly part: readonly Row[] };
const versions = JSON.parse(readFileSync(join(base, "versions.json"), "utf8")) as Record<string, { readonly tools: readonly string[]; readonly statuses: readonly string[] }>;
const synthetic = (name: string): string[] => readFileSync(join(base, "synthetic", name), "utf8").split("\n").filter((line) => line.trim() !== "");

const parsedParts = tables.part.map((row) => parsePart(str(row.data) ?? ""));
const okParts = parsedParts.flatMap((entry) => (entry.ok ? [entry] : []));
const partRecords = okParts.map((entry) => entry.record);
const toolParts = partRecords.filter((part) => part.kind === "tool");

describe("parsePart on the captured v1 part rows", () => {
  test("every captured part parses and nothing is unknown", () => {
    expect(okParts.length).toBe(tables.part.length);
    expect(parsedParts.filter((entry) => !entry.ok)).toEqual([]);
  });

  test("every captured part type and status is inside the enums", () => {
    expect(parsedParts.flatMap((entry) => (entry.ok ? entry.issues : []))).toEqual([]);
    expect([...new Set(partRecords.map((part) => part.partType))].sort()).toEqual(["reasoning", "step-finish", "step-start", "text", "tool"]);
  });

  test("tool statuses equal the statuses recorded for opencode 1.19.3", () => {
    expect([...new Set(toolParts.map((part) => part.status ?? ""))].sort()).toEqual([...versions["1.19.3"]!.statuses].sort());
  });

  test("tool names equal the names recorded for opencode 1.19.3", () => {
    expect([...new Set(toolParts.map((part) => part.tool ?? ""))].sort()).toEqual([...versions["1.19.3"]!.tools].sort());
  });

  test("no captured tool is in flight", () => {
    expect(toolParts.filter(isToolInFlight)).toEqual([]);
  });

  test("human text keeps only non-synthetic, non-ignored, non-empty text parts", () => {
    const expected = tables.part.filter((row) => {
      const part = obj(JSON.parse(str(row.data) ?? "{}"));
      return part.type === "text" && part.synthetic !== true && part.ignored !== true && (str(part.text) ?? "").trim() !== "";
    });
    expect(partRecords.filter((part) => humanText(part) !== null).length).toBe(expected.length);
  });

  test("tool input and start time come from state.input and time.start", () => {
    const withInput = toolParts.filter((part) => Object.keys(part.input).length > 0);
    expect(withInput.length).toBeGreaterThan(0);
    expect(partRecords.every((part) => part.startedAt === null || part.startedAt > 0)).toBe(true);
  });
});

const partFrom = (line: string): OpenCodePart => {
  const entry = parsePart(line);
  if (!entry.ok) {
    throw new Error(`expected a part from ${line}`);
  }
  return entry.record;
};

describe("parsePart on the synthetic part rows", () => {
  const lines = synthetic("parts.jsonl");

  test("a pending or running tool is in flight and its status is reported as unseen", () => {
    const pending = parsePart(lines[0]!);
    const running = parsePart(lines[1]!);
    expect(pending.ok && isToolInFlight(pending.record)).toBe(true);
    expect(running.ok && isToolInFlight(running.record)).toBe(true);
    expect(pending.ok && pending.issues.map((issue) => issue.got)).toEqual(["pending"]);
    expect(running.ok && running.issues.map((issue) => issue.got)).toEqual(["running"]);
  });

  test("a synthetic or ignored text part is not human text", () => {
    expect(humanText(partFrom(lines[2]!))).toBeNull();
    expect(humanText(partFrom(lines[3]!))).toBeNull();
  });

  test("a blank text part is not human text and a real one is", () => {
    expect(humanText(partFrom(lines[4]!))).toBeNull();
    expect(humanText(partFrom(lines[5]!))).toBe("amet consectetur");
  });

  test("an unseen part type is kept as other and reported", () => {
    const entry = parsePart(lines[6]!);
    expect(entry.ok && entry.record.kind).toBe("other");
    expect(entry.ok && entry.issues.map((issue) => issue.got)).toEqual(["file"]);
  });

  test("a part without a type or that is not JSON is not a record", () => {
    expect(parsePart("not json")).toEqual({ ok: false, reason: "not-json", type: null, row: null });
    expect(parsePart('{"text":"x"}')).toMatchObject({ ok: false, reason: "unknown-type", type: null });
  });
});

describe("parseMessage on the captured v1 message rows", () => {
  const messages = tables.message.map((row) => parseMessage(str(row.data) ?? ""));

  test("every captured message parses with no issues and no compaction", () => {
    expect(messages.every((entry) => entry.ok)).toBe(true);
    expect(messages.flatMap((entry) => (entry.ok ? entry.issues : []))).toEqual([]);
    expect(messages.flatMap((entry) => (entry.ok && entry.record.isCompaction ? [entry] : []))).toEqual([]);
  });

  test("roles are user and assistant and times are positive", () => {
    const records = messages.flatMap((entry) => (entry.ok ? [entry.record] : []));
    expect([...new Set(records.map((record) => record.role))].sort()).toEqual(["assistant", "user"]);
    expect(records.every((record) => record.createdAt !== null && record.createdAt > 0)).toBe(true);
  });

  test("provider and model come from the top level for assistants and from model for users", () => {
    const firstUser = messages.find((entry) => entry.ok && entry.record.role === "user");
    const firstAssistant = messages.find((entry) => entry.ok && entry.record.role === "assistant");
    expect(firstUser?.ok && firstUser.record.modelId).toBe("deepseek-v4.1-flash");
    expect(firstAssistant?.ok && firstAssistant.record.providerId).toBe("opencode");
  });
});

describe("parseMessage on the synthetic message rows", () => {
  const lines = synthetic("messages.jsonl");

  test("a summary with mode compaction is a compaction and carries its times", () => {
    const entry = parseMessage(lines[0]!);
    expect(entry.ok && entry.record).toMatchObject({ isCompaction: true, createdAt: 1793505040000, completedAt: 1793505041500, providerId: "opencode" });
  });

  test("a summary object on a user message is not a compaction and the provider comes from model", () => {
    const entry = parseMessage(lines[1]!);
    expect(entry.ok && entry.record).toMatchObject({ isCompaction: false, providerId: "opencode", modelId: "deepseek-v4.1-flash" });
  });

  test("a build mode message is not a compaction", () => {
    const entry = parseMessage(lines[2]!);
    expect(entry.ok && entry.record.isCompaction).toBe(false);
    expect(entry.ok && entry.issues).toEqual([]);
  });

  test("an unseen message mode and role are reported", () => {
    const entry = parseMessage(JSON.stringify({ role: "system", mode: "plan" }));
    expect(entry.ok && entry.issues.map((issue) => issue.got)).toEqual(["system", "plan"]);
  });

  test("a message that is not JSON is not a record", () => {
    expect(parseMessage("{")).toMatchObject({ ok: false, reason: "not-json" });
  });
});
