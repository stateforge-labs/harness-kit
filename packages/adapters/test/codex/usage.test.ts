import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readRollout, type CodexRow } from "../../src/codex/rollout.ts";
import { contextUsage, tokenCounts } from "../../src/codex/usage.ts";
import { adaptersFixtures } from "../support/fixtures.ts";

const day = join(adaptersFixtures, "codex", "sessions", "2026", "11", "01");
const rolloutOf = (suffix: string): CodexRow[] => readRollout(readFileSync(join(day, `rollout-2026-11-01T00-00-00-00000000-0000-4000-8000-${suffix}.jsonl`), "utf8").split("\n")).rows;

const count = (last: number, total: number, window: number): string =>
  JSON.stringify({ type: "event_msg", payload: { type: "token_count", info: { last_token_usage: { total_tokens: last }, total_token_usage: { total_tokens: total }, model_context_window: window } } });
const model = (name: string): string => JSON.stringify({ type: "turn_context", payload: { model: name } });
const parse = (lines: string[]): CodexRow[] => readRollout(lines).rows;

describe("tokenCounts on the captured rollouts", () => {
  test("the compacted rollout reports its one token count", () => {
    expect(tokenCounts(rolloutOf("0000000001fe"))).toEqual([{ last: 218241, total: 5659510, window: 258400, at: expect.any(Number) }]);
  });

  test("the first count in the early rollout is its opening turn", () => {
    const counts = tokenCounts(rolloutOf("00000000021e"));
    expect(counts[0]).toMatchObject({ last: 8803, total: 8803, window: 258400 });
  });

  test("every token count row is returned in order", () => {
    const counts = tokenCounts(rolloutOf("000000000229"));
    expect(counts.length).toBeGreaterThan(1);
    expect(counts[0]).toMatchObject({ last: 9480, total: 9480 });
    expect(counts[1]).toMatchObject({ last: 9770, total: 19250 });
  });
});

describe("contextUsage on the captured rollouts", () => {
  test("the compacted rollout is measured against its window", () => {
    expect(contextUsage(rolloutOf("0000000001fe"))).toEqual({ model: "gpt-6-luna", lastTokens: 218241, totalTokens: 5659510, window: 258400 });
  });

  test("a rollout with no turn_context has a null model", () => {
    expect(contextUsage(rolloutOf("000000000244"))?.model).toBeNull();
  });

  test("the busy rollout reports the sol model and its larger window", () => {
    expect(contextUsage(rolloutOf("000000000255"))).toMatchObject({ model: "gpt-6.1-sol", window: 475000 });
  });
});

describe("contextUsage rules", () => {
  test("no token count gives no usage", () => {
    expect(contextUsage(parse([model("gpt-6-luna")]))).toBeNull();
  });

  test("a count with a zero last total falls back to a positive total", () => {
    expect(contextUsage(parse([count(0, 500, 1000)]))).toEqual({ model: null, lastTokens: 0, totalTokens: 500, window: 1000 });
  });

  test("a count with no positive total is skipped for the last counted one", () => {
    expect(contextUsage(parse([count(100, 100, 1000), count(0, 0, 1000)]))).toEqual({ model: null, lastTokens: 100, totalTokens: 100, window: 1000 });
  });

  test("the latest turn_context model applies to the reported usage", () => {
    expect(contextUsage(parse([model("a"), count(10, 10, 100), model("b")]))?.model).toBe("b");
  });

  test("a zero or missing window is reported as null", () => {
    expect(contextUsage(parse([count(10, 10, 0)]))?.window).toBeNull();
  });
});
