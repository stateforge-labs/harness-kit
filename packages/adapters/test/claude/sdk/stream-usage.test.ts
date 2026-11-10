import { describe, expect, test } from "bun:test";
import type { AgentEvent } from "../../../src/agent/types.ts";
import { claudeSdkEngine, type ClaudeQueryOptions } from "../../../src/claude/engines/sdk.ts";
import { ASSISTANT, INIT, RESULT, collect, fakeQuery, runInput, withUuid } from "./support.ts";

const ABORT_MESSAGE = "Claude Code process aborted by user";
const FIRST = "msg_00000000000000000000000001";
const SECOND = "msg_00000000000000000000000002";

function usageOf(output: number): Record<string, number> {
  return { input_tokens: 2, cache_creation_input_tokens: 5, cache_read_input_tokens: 3, output_tokens: output };
}

function started(id: string, output: number, parent: string | null = null): Record<string, unknown> {
  return { type: "stream_event", parent_tool_use_id: parent, uuid: `s-${id}`, session_id: INIT["session_id"], event: { type: "message_start", message: { id, usage: usageOf(output) } } };
}

function delta(output: number, parent: string | null = null): Record<string, unknown> {
  return { type: "stream_event", parent_tool_use_id: parent, uuid: "d", session_id: INIT["session_id"], event: { type: "message_delta", usage: { output_tokens: output } } };
}

function filler(type: string, parent: string | null = null): Record<string, unknown> {
  return { type: "stream_event", parent_tool_use_id: parent, uuid: "f", session_id: INIT["session_id"], event: { type } };
}

function message(id: string, uuid: string, output: number): Record<string, unknown> {
  const base = ASSISTANT["message"] as Record<string, unknown>;
  return withUuid({ ...ASSISTANT, message: { ...base, usage: usageOf(output) } }, uuid, id);
}

async function run(script: readonly unknown[]) {
  const fake = fakeQuery(script);
  return collect(claudeSdkEngine({ query: fake.query }).start(runInput()));
}

function outputs(events: readonly AgentEvent[]): number[] {
  return events.flatMap((event) => (event.kind === "usage" ? [event.output] : []));
}

function aborting(prefix: readonly unknown[]) {
  return (options: ClaudeQueryOptions): AsyncIterable<unknown> => ({
    [Symbol.asyncIterator]: () => {
      const queue = [...prefix];
      return {
        next: async () => {
          const head = queue.shift();
          if (head !== undefined) {
            return { done: false, value: head };
          }
          await new Promise<void>((resolve) => options.abortController.signal.addEventListener("abort", () => resolve(), { once: true }));
          throw new Error(ABORT_MESSAGE);
        },
      };
    },
  });
}

describe("sdk usage from the message stream", () => {
  test("the cumulative output of the message deltas wins over the count at message start", async () => {
    const { events, end } = await run([INIT, started(FIRST, 1), filler("content_block_delta"), delta(4), delta(7), message(FIRST, "u1", 1), RESULT]);
    expect(outputs(events)).toEqual([7]);
    expect(end.ok && end.value.output.usage.map((entry) => entry.output)).toEqual([7]);
  });

  test("a delta that arrives after the assistant message still raises the usage", async () => {
    const { events } = await run([INIT, started(FIRST, 1), message(FIRST, "u1", 1), delta(9), RESULT]);
    expect(outputs(events)).toEqual([9]);
  });

  test("without stream events the output is the assistant message's own count", async () => {
    const { events } = await run([INIT, message(FIRST, "u1", 3), RESULT]);
    expect(outputs(events)).toEqual([3]);
  });

  test("a stream event from a subagent is ignored", async () => {
    const { events } = await run([INIT, started(FIRST, 1), delta(7, "toolu_00000000000000000001"), started(SECOND, 50, "toolu_00000000000000000001"), message(FIRST, "u1", 1), RESULT]);
    expect(outputs(events)).toEqual([1]);
  });

  test("two messages in one run each carry their own maximum", async () => {
    const script = [INIT, started(FIRST, 1), delta(7), message(FIRST, "u1", 1), started(SECOND, 1), delta(12), message(SECOND, "u2", 1), RESULT];
    const { events } = await run(script);
    expect(outputs(events)).toEqual([7, 12]);
  });

  test("stream events add no text, tool or turn events", async () => {
    const plain = [INIT, message(FIRST, "u1", 1), message(SECOND, "u2", 1), RESULT];
    const streamed = [INIT, started(FIRST, 1), filler("content_block_start"), filler("content_block_delta"), delta(7), message(FIRST, "u1", 1), started(SECOND, 1), delta(8), message(SECOND, "u2", 1), RESULT];
    const strip = (events: readonly { readonly kind: string }[]) => events.map((event) => (event.kind === "usage" ? { ...event, input: 0, cacheWrite: 0, cacheRead: 0, output: 0 } : event));
    const left = await run(plain);
    const right = await run(streamed);
    expect(strip(right.events)).toEqual(strip(left.events));
  });

  test("a cancel in the middle of the second message still reports the first message's maximum", async () => {
    const script = [INIT, started(FIRST, 1), delta(7), message(FIRST, "u1", 1), started(SECOND, 1), delta(2)];
    const fake = fakeQuery(aborting(script));
    const handle = claudeSdkEngine({ query: fake.query }).start(runInput());
    setTimeout(() => handle.cancel(), 10);
    const { events } = await collect(handle);
    expect(outputs(events)).toEqual([7]);
  });
});
