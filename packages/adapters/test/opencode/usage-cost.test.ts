import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { opencodeCli } from "../../src/opencode/engines/cli.ts";
import { opencodeLineEvents, readOpencodeRun } from "../../src/opencode/engines/read-run.ts";
import { opencodeSessionExportArgs, parseSessionModel } from "../../src/opencode/launch.ts";
import { adaptersFixtures } from "../support/fixtures.ts";
import { interpretEvents, type InterpretRaw } from "../support/interpret.ts";

const headless = join(adaptersFixtures, "opencode", "headless");
const read = (name: string): string => readFileSync(join(headless, name), "utf8");
const toolsDefault = read("run-tools-default.jsonl");
const toolsOff = read("run-tools-off.jsonl");
const exported = read("session-export.json");

function raw(out: string, code: number | null = 0): InterpretRaw {
  return { stdout: out, stderrTail: "", exit: { code, signal: null }, outFileText: null, requestedModel: null };
}

const STEP_FINISH_DEFAULT = { cost: 0.0891462, input: 4, output: 8, reasoning: 0, cacheRead: 5971, cacheWrite: 8760 };
const STEP_FINISH_OFF = { cost: 0.0047154, input: 4, output: 8, reasoning: 0, cacheRead: 1667, cacheWrite: 403 };

function stepFinish(over: Partial<typeof STEP_FINISH_DEFAULT>): string {
  const f = { ...STEP_FINISH_DEFAULT, ...over };
  return JSON.stringify({
    type: "step_finish",
    sessionID: "ses_1",
    part: { type: "step-finish", cost: f.cost, tokens: { input: f.input, output: f.output, reasoning: f.reasoning, cache: { read: f.cacheRead, write: f.cacheWrite } } },
  });
}

describe("opencode step_finish from a real 2.2.6 run", () => {
  test("the cost row carries the harness figure with no stated basis", () => {
    const finish = toolsDefault.split("\n").filter((line) => line !== "")[2] ?? "";
    const events = opencodeLineEvents(finish);
    expect(events.map((event) => event.kind)).toEqual(["session", "cost"]);
    expect(events[1]).toEqual({ kind: "cost", cost: { usd: STEP_FINISH_DEFAULT.cost, basis: "unreported" } });
  });

  test("readOpencodeRun reads the tokens of both captures", () => {
    expect(readOpencodeRun(toolsDefault).usage).toEqual({
      inputTokens: 4,
      outputTokens: 8,
      cacheReadTokens: 5971,
      cacheWriteTokens: 8760,
      reasoningTokens: 0,
      totalTokens: null,
    });
    expect(readOpencodeRun(toolsOff).usage).toEqual({
      inputTokens: 4,
      outputTokens: 8,
      cacheReadTokens: 1667,
      cacheWriteTokens: 403,
      reasoningTokens: 0,
      totalTokens: null,
    });
  });

  test("the stream cost equals the session cost the export reports", () => {
    const info = JSON.parse(exported) as { info: { cost: number; tokens: { input: number; output: number; cache: { read: number; write: number } } } };
    expect(readOpencodeRun(toolsDefault).cost).toBe(info.info.cost);
    expect(info.info.tokens.cache).toEqual({ read: STEP_FINISH_DEFAULT.cacheRead, write: STEP_FINISH_DEFAULT.cacheWrite });
  });

  test("two steps add up their tokens and their cost", () => {
    const reading = readOpencodeRun([stepFinish({}), stepFinish(STEP_FINISH_OFF)].join("\n"));
    expect(reading.cost).toBeCloseTo(STEP_FINISH_DEFAULT.cost + STEP_FINISH_OFF.cost, 10);
    expect(reading.usage).toEqual({
      inputTokens: 8,
      outputTokens: 16,
      cacheReadTokens: 5971 + 1667,
      cacheWriteTokens: 8760 + 403,
      reasoningTokens: 0,
      totalTokens: null,
    });
  });

  test("a step with a cost and no tokens leaves usage unknown", () => {
    const reading = readOpencodeRun('{"type":"step_finish","sessionID":"ses_1","part":{"cost":0.5}}');
    expect(reading.cost).toBe(0.5);
    expect(reading.usage).toBeNull();
  });

  test("a token field that is missing stays unknown instead of becoming zero", () => {
    const reading = readOpencodeRun('{"type":"step_finish","part":{"cost":0.1,"tokens":{"input":3,"output":2}}}');
    expect(reading.usage).toEqual({ inputTokens: 3, outputTokens: 2, cacheReadTokens: null, cacheWriteTokens: null, reasoningTokens: null, totalTokens: null });
  });
});

describe("opencode session export model", () => {
  test("the model of the assistant message is the provider and the model id", () => {
    expect(parseSessionModel(exported)).toBe("opencode/claude-fable-5-2");
  });

  test("an export without an assistant message has no model", () => {
    expect(parseSessionModel('{"messages":[{"type":"user"}]}')).toBeNull();
    expect(parseSessionModel("not json")).toBeNull();
    expect(parseSessionModel("")).toBeNull();
  });

  test("a model without a provider is the bare id", () => {
    expect(parseSessionModel('{"messages":[{"type":"assistant","model":{"id":"m1"}}]}')).toBe("m1");
  });

  test("the last assistant message decides", () => {
    const rows = [
      { type: "assistant", model: { id: "a", providerID: "p" } },
      { type: "assistant", model: { id: "b", providerID: "p" } },
    ];
    expect(parseSessionModel(JSON.stringify({ messages: rows }))).toBe("p/b");
  });

  test("the export command is standalone and names the session", () => {
    expect(opencodeSessionExportArgs("ses_1")).toEqual(["session", "export", "--standalone", "ses_1"]);
  });
});

describe("opencodeCli run result from the captures", () => {
  test("usage, cost and model come together for the default-tools capture", async () => {
    const run = await interpretEvents(opencodeCli, raw(toolsDefault), [{ chunks: [exported] }, { chunks: [] }]);
    if (!run.result.ok) {
      throw new Error("expected ok");
    }
    expect(run.result.value.text).toBe("magn\ndo do");
    expect(run.result.value.cost).toEqual({ usd: STEP_FINISH_DEFAULT.cost, basis: "unreported" });
    expect(run.result.value.model).toBe("opencode/claude-fable-5-2");
    expect(run.result.value.usage).toEqual({
      inputTokens: 4,
      outputTokens: 8,
      cacheReadTokens: 5971,
      cacheWriteTokens: 8760,
      reasoningTokens: 0,
      totalTokens: null,
    });
  });

  test("the tools-off capture reports its own smaller figure", async () => {
    const run = await interpretEvents(opencodeCli, raw(toolsOff), [{ chunks: [exported] }, { chunks: [] }]);
    if (!run.result.ok) {
      throw new Error("expected ok");
    }
    expect(run.result.value.cost.usd).toBe(STEP_FINISH_OFF.cost);
    expect(run.result.value.usage.cacheWriteTokens).toBe(STEP_FINISH_OFF.cacheWrite);
  });

  test("a failed export leaves the model absent and keeps usage and cost", async () => {
    const run = await interpretEvents(opencodeCli, raw(toolsDefault), [{ chunks: [], code: 1 }, { chunks: [] }]);
    if (!run.result.ok) {
      throw new Error("expected ok");
    }
    expect(run.result.value.model).toBeNull();
    expect(run.result.value.usage.inputTokens).toBe(4);
    expect(run.result.value.cost.usd).toBe(STEP_FINISH_DEFAULT.cost);
  });

  test("a run without tokens reports the cost with unknown usage and no model", async () => {
    const tokenless = '{"type":"text","sessionID":"ses_1","part":{"text":"ok"}}\n{"type":"step_finish","sessionID":"ses_1","part":{"cost":0.01}}\n';
    const run = await interpretEvents(opencodeCli, raw(tokenless), [{ chunks: [] }, { chunks: [] }]);
    if (!run.result.ok) {
      throw new Error("expected ok");
    }
    expect(run.result.value.cost).toEqual({ usd: 0.01, basis: "unreported" });
    expect(run.result.value.usage.inputTokens).toBeNull();
    expect(run.result.value.model).toBeNull();
  });

  test("the requested model is kept when the export names none", async () => {
    const withRequested: InterpretRaw = { ...raw(toolsDefault), requestedModel: "anthropic/claude-haiku-5-5" };
    const run = await interpretEvents(opencodeCli, withRequested, [{ chunks: [] }, { chunks: [] }]);
    if (!run.result.ok) {
      throw new Error("expected ok");
    }
    expect(run.result.value.model).toBe("anthropic/claude-haiku-5-5");
  });

  test("no export is requested when the run failed", async () => {
    const failed = '{"type":"error","sessionID":"ses_1","error":{"message":"boom"}}\n';
    const run = await interpretEvents(opencodeCli, raw(failed), []);
    expect(run.result.ok).toBe(false);
    expect(run.events.some((e) => e.kind === "model" || e.kind === "usage")).toBe(false);
  });
});
