import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { str, type Row } from "../../src/core/rows.ts";
import { messageUsage, modelRef, parseMessage, type OpenCodeMessageUsage } from "../../src/opencode/index.ts";
import { adaptersFixtures } from "../support/fixtures.ts";

const base = join(adaptersFixtures, "opencode");
const tables = JSON.parse(readFileSync(join(base, "rows-v1.json"), "utf8")) as { readonly message: readonly Row[] };
const synthetic = readFileSync(join(base, "synthetic", "messages.jsonl"), "utf8").split("\n").filter((line) => line.trim() !== "");

const capturedUsages = (): OpenCodeMessageUsage[] =>
  tables.message.flatMap((row) => {
    const entry = parseMessage(str(row["data"]) ?? "");
    return entry.ok ? [messageUsage(entry.record)] : [];
  });

describe("messageUsage on the captured message rows", () => {
  test("every captured message parses", () => {
    expect(capturedUsages().length).toBe(tables.message.length);
  });

  test("each count equals the raw field of the same row", () => {
    tables.message.forEach((row, index) => {
      const raw = JSON.parse(str(row["data"]) ?? "{}") as { readonly tokens?: { readonly input?: number; readonly output?: number; readonly cache?: { readonly read?: number; readonly write?: number } } };
      const usage = capturedUsages()[index];
      expect([index, usage?.input, usage?.output, usage?.cacheRead, usage?.cacheWrite]).toEqual([
        index,
        raw.tokens?.input ?? 0,
        raw.tokens?.output ?? 0,
        raw.tokens?.cache?.read ?? 0,
        raw.tokens?.cache?.write ?? 0,
      ]);
    });
  });

  test("the first captured assistant reply carries its input, output and cache counts and its provider model", () => {
    const reply = capturedUsages().find((usage) => usage.role === "assistant" && usage.input === 768);
    expect(reply).toEqual({
      role: "assistant",
      input: 768,
      output: 356,
      cacheRead: 1760,
      cacheWrite: 0,
      providerId: "opencode",
      modelId: "deepseek-v4.1-flash",
    });
    expect(modelRef(reply ?? { providerId: null, modelId: null })).toBe("opencode/deepseek-v4.1-flash");
  });

  test("a user message has no tokens and takes its model from the nested model object", () => {
    const user = capturedUsages().find((usage) => usage.role === "user");
    expect(user).toEqual({ role: "user", input: 0, output: 0, cacheRead: 0, cacheWrite: 0, providerId: "opencode", modelId: "deepseek-v4.1-flash" });
  });
});

describe("modelRef on the synthetic message rows", () => {
  const parsed = synthetic.map((line) => {
    const entry = parseMessage(line);
    return entry.ok ? messageUsage(entry.record) : null;
  });

  test("a message with a provider and a model is written provider/model", () => {
    expect(parsed[0] && modelRef(parsed[0])).toBe("opencode/deepseek-v4.1-flash");
  });

  test("a message without a model has no reference", () => {
    expect(parsed[2] && modelRef(parsed[2])).toBeNull();
    expect(parsed[2]).toMatchObject({ role: "assistant", input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
  });

  test("a model with no provider falls back to the bare model id", () => {
    expect(modelRef({ providerId: null, modelId: "deepseek-v4.1-flash" })).toBe("deepseek-v4.1-flash");
  });
});
