import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCli } from "../../src/claude/engines/cli.ts";
import { claudeLineEvents } from "../../src/claude/engines/read-stream.ts";
import { secret } from "../../src/core/secret.ts";
import type { RunEvent } from "../../src/core/run.ts";
import type { ProcessRunner } from "../../src/driver/ports.ts";
import { createRuntime } from "../../src/runtime/index.ts";
import { chunkedRunner } from "../support/chunked-runner.ts";
import { fakeClock } from "../support/fakes.ts";
import { adaptersFixtures } from "../support/fixtures.ts";
import { interpretEvents, interpretRaw } from "../support/interpret.ts";
import { RUN_CWD, binFs, fixture, sourceOf } from "../runtime/support.ts";

const capture = readFileSync(join(adaptersFixtures, "claude", "headless", "claude-stream-json-verbose.jsonl"), "utf8");
const lines = capture.split("\n").filter((line) => line !== "");
const resultIndex = lines.findIndex((line) => (JSON.parse(line) as { type: string }).type === "result");
const resultRow = JSON.parse(lines[resultIndex] ?? "{}") as Record<string, unknown>;
const firstModel = Object.keys(resultRow["modelUsage"] as object)[0] ?? "";

function raw(stdout: string, code = 0) {
  return { stdout, stderrTail: "", exit: { code, signal: null }, outFileText: null, requestedModel: "haiku" };
}

function valueOf<T>(result: { readonly ok: boolean; readonly value?: T }): T {
  if (!result.ok || result.value === undefined) {
    throw new Error("expected ok");
  }
  return result.value;
}

function splitMidLine(text: string, parts: number): string[] {
  const size = Math.ceil(text.length / parts);
  return Array.from({ length: parts }, (_unused, index) => text.slice(index * size, (index + 1) * size));
}

function runtimeFor(chunks: readonly string[]) {
  const scripted = chunkedRunner([{ chunks }]);
  const runner: ProcessRunner = (spec) => {
    if (spec.args.includes("--version")) {
      return chunkedRunner([{ chunks: [fixture("claude", "version.txt")] }]).runner(spec);
    }
    if (spec.args.includes("--help")) {
      return chunkedRunner([{ chunks: [fixture("claude", "help.txt")] }]).runner(spec);
    }
    return scripted.runner(spec);
  };
  return createRuntime({ source: sourceOf(), spawn: runner, fs: binFs(), clock: fakeClock(0), platform: "linux", cwd: () => RUN_CWD });
}

const CREDENTIAL = { mode: "api-key", key: secret("sk-test") };

describe("claude stream-json capture", () => {
  test("the fold of the capture carries text, cost, usage, model and session", async () => {
    const value = valueOf(await interpretRaw(claudeCli, raw(capture)));
    expect(value.text).toBe(resultRow["result"] as string);
    expect(value.cost.usd).toBe(resultRow["total_cost_usd"] as number);
    expect(value.usage).toEqual({ inputTokens: 2, outputTokens: 4, cacheReadTokens: 0, cacheWriteTokens: 51626, reasoningTokens: 0, totalTokens: null });
    expect(value.model).toBe(firstModel);
    expect(value.sessionId as string | null).toBe(resultRow["session_id"] as string);
    expect(value.unrecognised).toEqual([]);
  });

  test("the cost basis is unreported when the row does not say list", async () => {
    const value = valueOf(await interpretRaw(claudeCli, raw(capture)));
    expect(value.cost.basis).toBe("unreported");
  });

  test("a list cost basis is carried", async () => {
    const listed = capture.replace('"costBasis":"unknown"', '"costBasis":"list"');
    const value = valueOf(await interpretRaw(claudeCli, raw(listed)));
    expect(value.cost.basis).toBe("list");
  });

  test("the first text event comes before the result row", () => {
    const firstText = lines.findIndex((line) => claudeLineEvents(line).some((event) => event.kind === "text"));
    expect(firstText).toBeGreaterThanOrEqual(0);
    expect(firstText).toBeLessThan(resultIndex);
  });

  test("replayed through the engine events arrive in order with text first", async () => {
    const { events } = await interpretEvents(claudeCli, raw(capture));
    const kinds = events.map((event) => event.kind);
    expect(kinds.indexOf("text")).toBeLessThan(kinds.indexOf("final"));
  });

  test("an is_error result is an exit failure carrying the real exit code", async () => {
    const failing = capture.replace('"is_error":false', '"is_error":true');
    const result = await interpretRaw(claudeCli, raw(failing, 1));
    expect(!result.ok && result.failure).toMatchObject({ kind: "exit", code: 1 });
  });

  test("a garbage line is unrecognised and never throws", () => {
    expect(claudeLineEvents("not json at all")).toEqual([{ kind: "unrecognised", payload: "not json at all" }]);
    expect(claudeLineEvents("42")).toEqual([{ kind: "unrecognised", payload: "42" }]);
  });

  test("an unknown row type is unrecognised and a known ignored type is silent", () => {
    expect(claudeLineEvents('{"type":"mystery"}')).toEqual([{ kind: "unrecognised", payload: { type: "mystery" } }]);
    expect(claudeLineEvents('{"type":"system","subtype":"init"}')).toEqual([]);
    expect(claudeLineEvents('{"type":"user"}')).toEqual([]);
    expect(claudeLineEvents("")).toEqual([]);
  });

  test("an assistant row gives one text event per text block and skips other blocks", () => {
    const row = JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "a" }, { type: "tool_use", name: "x" }, { type: "text", text: "b" }] } });
    expect(claudeLineEvents(row)).toEqual([
      { kind: "text", text: "a" },
      { kind: "text", text: "b" },
    ]);
  });

  test("empty stdout with exit 0 is unparsable", async () => {
    const result = await interpretRaw(claudeCli, raw(""));
    expect(!result.ok && result.failure).toMatchObject({ kind: "unparsable", reason: "empty-text" });
  });
});

describe("claude stream-json through the runtime", () => {
  test("stream yields text before finished and run returns the same fields", async () => {
    const parts = splitMidLine(capture, 3);
    expect(parts.slice(0, 2).every((part) => !part.endsWith("\n"))).toBe(true);
    const events: RunEvent[] = [];
    for await (const event of runtimeFor(parts).headless("claude", { credential: CREDENTIAL } as never).stream({ instructions: "x", input: "y" })) {
      events.push(event);
    }
    const kinds = events.map((event) => event.kind);
    expect(kinds.indexOf("text")).toBeGreaterThan(-1);
    expect(kinds.indexOf("text")).toBeLessThan(kinds.indexOf("finished"));
    const finished = events.find((event) => event.kind === "finished");
    const streamed = finished?.kind === "finished" ? valueOf(finished.result) : null;
    const ran = valueOf(await runtimeFor(parts).headless("claude", { credential: CREDENTIAL } as never).run({ instructions: "x", input: "y" }));
    expect(streamed).not.toBeNull();
    expect(ran.text).toBe("ok");
    expect(ran.cost).toEqual(streamed?.cost as never);
    expect(ran.usage).toEqual(streamed?.usage as never);
    expect(ran.sessionId).toBe(streamed?.sessionId as never);
    expect(ran.model).toBe(firstModel);
  });
});
