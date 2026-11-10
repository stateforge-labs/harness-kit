import { describe, expect, test } from "bun:test";
import type { AgentRunInput } from "../../../src/agent/engine.ts";
import { claudeSdkEngine, type ClaudeQueryOptions } from "../../../src/claude/engines/sdk.ts";
import type { ClaudeQueryFn } from "../../../src/claude/engines/sdk.ts";
import { TOOLS_OFF } from "../../../src/core/policy.ts";
import { fakeClock } from "../../../src/testing/fake-clock.ts";
import { ASSISTANT, BASIC, INIT, KEY, RESULT, SESSION, collect, endpoint, fakeQuery, kinds, memoryStore, never, runInput } from "./support.ts";

const ABORT_MESSAGE = "Claude Code process aborted by user";

function aborting(prefix: readonly unknown[], gone: { done: boolean }) {
  return (options: ClaudeQueryOptions): AsyncIterable<unknown> => ({
    [Symbol.asyncIterator]: () => {
      const queue = [...prefix];
      return {
        next: async () => {
          const head = queue.shift();
          if (head !== undefined) {
            return { done: false, value: head };
          }
          await new Promise<void>((resolve) => {
            if (options.abortController.signal.aborted) {
              resolve();
              return;
            }
            options.abortController.signal.addEventListener("abort", () => resolve(), { once: true });
          });
          gone.done = true;
          throw new Error(ABORT_MESSAGE);
        },
      };
    },
  });
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 5));

function failureOf(end: { readonly ok: boolean; readonly failure?: { readonly kind: string } }): string | null {
  return end.ok ? null : (end.failure?.kind ?? null);
}

describe("sdk failures", () => {
  test("the max turns result is max-turns with the turn count", async () => {
    const result = { ...RESULT, subtype: "error_max_turns", is_error: false, num_turns: 4, errors: [] };
    const fake = fakeQuery([INIT, ASSISTANT, result]);
    const { end } = await collect(claudeSdkEngine({ query: fake.query }).start(runInput()));
    expect(end).toEqual({ ok: false, failure: { kind: "max-turns", message: expect.any(String), turns: 4 } });
  });

  test("an error result is an exit failure with a redacted tail", async () => {
    const result = { ...RESULT, subtype: "error_during_execution", is_error: true, errors: [`boom ${KEY}`] };
    const fake = fakeQuery([INIT, ASSISTANT, result]);
    const { end } = await collect(claudeSdkEngine({ query: fake.query }).start(runInput()));
    expect(failureOf(end)).toBe("exit");
    expect(JSON.stringify(end)).not.toContain(KEY);
    expect(JSON.stringify(end)).toContain("boom [redacted]");
  });

  test("an api 401 on a success-shaped error result is auth-rejected", async () => {
    const result = { ...RESULT, is_error: true, api_error_status: 401, result: "invalid x-api-key" };
    const fake = fakeQuery([INIT, ASSISTANT, result]);
    const { end } = await collect(claudeSdkEngine({ query: fake.query }).start(runInput()));
    expect(failureOf(end)).toBe("auth-rejected");
  });

  test("structured output retries exhausted is unparsable", async () => {
    const result = { ...RESULT, subtype: "error_max_structured_output_retries", is_error: true, errors: [] };
    const fake = fakeQuery([INIT, ASSISTANT, result]);
    const { end } = await collect(claudeSdkEngine({ query: fake.query }).start(runInput({ start: { outputSchema: { type: "object" } } })));
    expect(failureOf(end)).toBe("unparsable");
  });

  test("a stream that throws is an exit failure carrying the redacted message", async () => {
    const fake = fakeQuery(() => ({
      [Symbol.asyncIterator]: () => ({
        next: async () => {
          throw new Error(`Claude Code process exited with code 1 ${KEY}`);
        },
      }),
    }));
    const { end } = await collect(claudeSdkEngine({ query: fake.query }).start(runInput()));
    expect(failureOf(end)).toBe("exit");
    expect(JSON.stringify(end)).not.toContain(KEY);
  });

  test("a stream that ends without a result is no-output", async () => {
    const fake = fakeQuery([INIT]);
    const { end } = await collect(claudeSdkEngine({ query: fake.query }).start(runInput()));
    expect(failureOf(end)).toBe("no-output");
  });

  test("a query that throws synchronously is unavailable", async () => {
    const engine = claudeSdkEngine({
      query: () => {
        throw new Error("nope");
      },
    });
    const { end } = await collect(engine.start(runInput()));
    expect(end.ok ? null : end.failure).toMatchObject({ kind: "unavailable" });
  });

  test("a config failure ends the run before the query is called", async () => {
    const fake = fakeQuery(BASIC);
    const tools = { ...TOOLS_OFF, mcp: [endpoint("alpha")] };
    const { end, events } = await collect(claudeSdkEngine({ query: fake.query }).start(runInput({ options: { tools } })));
    expect(failureOf(end)).toBe("invalid-config");
    expect(fake.calls).toHaveLength(0);
    expect(kinds(events)).toEqual(["started"]);
  });
});

describe("sdk cancel", () => {
  test("an abort turns the iterator's abort error into cancelled after the stream ended", async () => {
    const gone = { done: false };
    const fake = fakeQuery(aborting([INIT, ASSISTANT], gone));
    const run = claudeSdkEngine({ query: fake.query }).start(runInput());
    const seen: string[] = [];
    const reading = (async () => {
      for await (const event of run.events) {
        seen.push(event.kind);
        if (event.kind === "text") {
          run.cancel();
        }
      }
    })();
    const end = await run.done;
    await reading;
    expect(failureOf(end)).toBe("cancelled");
    expect(gone.done).toBe(true);
    expect(fake.closed.count).toBe(1);
  });

  test("the engine settles only after the process tree is reaped", async () => {
    const order: string[] = [];
    const gone = { done: false };
    const fake = fakeQuery(aborting([INIT, ASSISTANT], gone));
    const tree = {
      spawn: () => {
        throw new Error("unused");
      },
      kill: async () => undefined,
      reap: async () => {
        order.push(gone.done ? "reaped-after-stream" : "reaped-early");
        await new Promise((resolve) => setTimeout(resolve, 20));
        order.push("tree-gone");
        return "gone" as const;
      },
      stderrTail: () => "tail",
    };
    const run = claudeSdkEngine({ query: fake.query, tree: () => tree }).start(runInput());
    const reading = (async () => {
      for await (const event of run.events) {
        if (event.kind === "text") {
          run.cancel();
        }
      }
    })();
    const end = await run.done.then((value) => {
      order.push("settled");
      return value;
    });
    await reading;
    expect(failureOf(end)).toBe("cancelled");
    expect(order).toEqual(["reaped-after-stream", "tree-gone", "settled"]);
  });

  test("a stream that never ends after the abort is abandoned at the deadline on the injected clock", async () => {
    const clock = fakeClock();
    const calls: string[] = [];
    const tree = { spawn: () => { throw new Error("unused"); }, kill: async () => void calls.push("kill"), reap: async () => (calls.push("reap"), "gone" as const), stderrTail: () => "" };
    const fake = fakeQuery(() => never());
    const run = claudeSdkEngine({ query: fake.query, tree: () => tree }).start(runInput({ clock }));
    let settled = false;
    void run.done.then(() => (settled = true));
    await flush();
    run.cancel();
    await flush();
    clock.advance(2499);
    await flush();
    expect(settled).toBe(false);
    expect(calls).toEqual([]);
    clock.advance(1);
    const end = await run.done;
    expect(failureOf(end)).toBe("cancelled");
    expect(calls).toEqual(["kill", "reap"]);
    expect(run.tree?.()).toBe("gone");
    expect(fake.closed.count).toBe(1);
  });

  test("a stream whose close never returns is given up on at the give-up time", async () => {
    const clock = fakeClock();
    const query: ClaudeQueryFn = () => ({ [Symbol.asyncIterator]: () => never()[Symbol.asyncIterator](), close: () => new Promise<void>(() => undefined) });
    const run = claudeSdkEngine({ query }).start(runInput({ clock }));
    await flush();
    run.cancel();
    await flush();
    clock.advance(2500);
    await flush();
    clock.advance(5999);
    await flush();
    let settled = false;
    void run.done.then(() => (settled = true));
    await flush();
    expect(settled).toBe(false);
    clock.advance(1);
    expect(failureOf(await run.done)).toBe("cancelled");
  });

  test("a tree that could not be confirmed gone is reported on the run", async () => {
    const tree = { spawn: () => { throw new Error("unused"); }, kill: async () => undefined, reap: async () => "unconfirmed" as const, stderrTail: () => "" };
    const run = claudeSdkEngine({ query: fakeQuery(BASIC).query, tree: () => tree }).start(runInput());
    expect((await run.done).ok).toBe(true);
    expect(run.tree?.()).toBe("unconfirmed");
  });

  test("an aborted input signal cancels the run", async () => {
    const controller = new AbortController();
    const gone = { done: false };
    const fake = fakeQuery(aborting([INIT, ASSISTANT], gone));
    const run = claudeSdkEngine({ query: fake.query }).start(runInput({ signal: controller.signal }));
    setTimeout(() => controller.abort(), 10);
    const { end } = await collect(run);
    expect(failureOf(end)).toBe("cancelled");
  });

  test("a signal aborted before start never queries", async () => {
    const controller = new AbortController();
    controller.abort();
    const fake = fakeQuery(BASIC);
    const { end, events } = await collect(claudeSdkEngine({ query: fake.query }).start(runInput({ signal: controller.signal })));
    expect(failureOf(end)).toBe("cancelled");
    expect(fake.calls).toHaveLength(0);
    expect(kinds(events)).toEqual(["started"]);
  });

  test("events after the abort are dropped", async () => {
    const gone = { done: false };
    const fake = fakeQuery(aborting([INIT], gone));
    const run = claudeSdkEngine({ query: fake.query }).start(runInput());
    run.cancel();
    const { events, end } = await collect(run);
    expect(failureOf(end)).toBe("cancelled");
    expect(kinds(events)).toEqual(["started"]);
  });

  test("a result received before the abort wins over the cancel", async () => {
    const fake = fakeQuery([INIT, ASSISTANT, RESULT]);
    const run = claudeSdkEngine({ query: fake.query }).start(runInput());
    const { end } = await collect(run);
    run.cancel();
    expect(end.ok).toBe(true);
  });

  test("done never rejects when the stream never ends and the abort frees it", async () => {
    const fake = fakeQuery((options) => ({
      [Symbol.asyncIterator]: () => ({
        next: () =>
          new Promise<IteratorResult<unknown>>((_resolve, reject) => {
            options.abortController.signal.addEventListener("abort", () => reject(new Error(ABORT_MESSAGE)), { once: true });
          }),
      }),
    }));
    const run = claudeSdkEngine({ query: fake.query }).start(runInput());
    setTimeout(() => run.cancel(), 5);
    const { end } = await collect(run);
    expect(failureOf(end)).toBe("cancelled");
    void never;
  });
});

describe("sdk resume and recovery", () => {
  const resume = { sessionId: SESSION, checkpoint: "uuid-5" };

  test("a missing session before any assistant message is session-not-found", async () => {
    const result = { ...RESULT, subtype: "error_during_execution", is_error: true, errors: [`No conversation found with session ID: ${SESSION}`] };
    const fake = fakeQuery([result]);
    const { end } = await collect(claudeSdkEngine({ query: fake.query }).start(runInput({ start: { resume } })));
    expect(end).toEqual({ ok: false, failure: { kind: "session-not-found", message: expect.any(String), sessionId: SESSION } });
  });

  test("the same text thrown by the stream is session-not-found too", async () => {
    const fake = fakeQuery(() => ({
      [Symbol.asyncIterator]: () => ({
        next: async () => {
          throw new Error(`No conversation found with session ID: ${SESSION}`);
        },
      }),
    }));
    const { end } = await collect(claudeSdkEngine({ query: fake.query }).start(runInput({ start: { resume } })));
    expect(failureOf(end)).toBe("session-not-found");
  });

  test("without a resume the same text is a plain exit failure", async () => {
    const result = { ...RESULT, subtype: "error_during_execution", is_error: true, errors: ["No conversation found with session ID: x"] };
    const fake = fakeQuery([result]);
    const { end } = await collect(claudeSdkEngine({ query: fake.query }).start(runInput()));
    expect(failureOf(end)).toBe("exit");
  });

  test("after an assistant message the text is a plain exit failure", async () => {
    const result = { ...RESULT, subtype: "error_during_execution", is_error: true, errors: ["No conversation found with session ID: x"] };
    const fake = fakeQuery([INIT, ASSISTANT, result]);
    const { end } = await collect(claudeSdkEngine({ query: fake.query }).start(runInput({ start: { resume } })));
    expect(failureOf(end)).toBe("exit");
  });

  test("the engine never retries by itself", async () => {
    const result = { ...RESULT, subtype: "error_during_execution", is_error: true, errors: ["No conversation found with session ID: x"] };
    const fake = fakeQuery([result], BASIC);
    await collect(claudeSdkEngine({ query: fake.query }).start(runInput({ start: { resume: { ...resume, recoveryPrompt: "again" } } })));
    expect(fake.calls).toHaveLength(1);
  });
});

describe("sdk transcript store", () => {
  const key = { projectKey: "proj", sessionId: SESSION };

  async function adapterOf(store = memoryStore()) {
    const fake = fakeQuery([]);
    await collect(claudeSdkEngine({ query: fake.query }).start(runInput({ start: { store } })));
    const adapter = fake.calls[0]?.options.sessionStore;
    if (adapter === undefined) {
      throw new Error("no adapter");
    }
    return { adapter, store };
  }

  test("append maps entries to uuid and json under a key built from the SDK key parts", async () => {
    const { adapter, store } = await adapterOf();
    await adapter.append(key, [{ type: "user", uuid: "u1", n: 1 }, { type: "title" }]);
    await adapter.append({ ...key, subpath: "subagents/a" }, [{ type: "user", uuid: "u2" }]);
    expect(store.entries.get(`proj/${SESSION}`)).toEqual([
      { uuid: "u1", json: JSON.stringify({ type: "user", uuid: "u1", n: 1 }) },
      { uuid: "", json: JSON.stringify({ type: "title" }) },
    ]);
    expect(store.entries.get(`proj/${SESSION}/subagents/a`)).toHaveLength(1);
  });

  test("load parses the entries back and a missing key is null", async () => {
    const { adapter, store } = await adapterOf();
    await adapter.append(key, [{ type: "user", uuid: "u1", n: 1 }]);
    expect(await adapter.load(key)).toEqual([{ type: "user", uuid: "u1", n: 1 }]);
    expect(await adapter.load({ ...key, sessionId: "other" })).toBeNull();
    expect(store.entries.size).toBe(1);
  });

  test("listSubkeys returns the subpaths under the session key", async () => {
    const { adapter } = await adapterOf();
    await adapter.append({ ...key, subpath: "subagents/a" }, [{ type: "user" }]);
    expect(await adapter.listSubkeys?.(key)).toEqual(["subagents/a"]);
  });

  test("an append rejection ends the run with store-failed even when the stream succeeds", async () => {
    const store = memoryStore();
    const fake = fakeQuery(async function* (options: ClaudeQueryOptions) {
      yield INIT;
      yield ASSISTANT;
      await options.sessionStore?.append(key, [{ type: "user", uuid: "u1" }]).then(undefined, () => undefined);
      yield RESULT;
    } as never);
    store.failure = new Error(`disk full ${KEY}`);
    const { end } = await collect(claudeSdkEngine({ query: fake.query }).start(runInput({ start: { store } })));
    expect(end.ok ? null : end.failure).toMatchObject({ kind: "store-failed", reason: "disk full [redacted]" });
  });

  test("a mirror error message aborts the run and ends it with store-failed", async () => {
    const gone = { done: false };
    const mirror = { type: "system", subtype: "mirror_error", error: "append rejected", key, uuid: "m", session_id: SESSION };
    const fake = fakeQuery(aborting([INIT, ASSISTANT, mirror], gone));
    const { end } = await collect(claudeSdkEngine({ query: fake.query }).start(runInput({ start: { store: memoryStore() } })));
    expect(end.ok ? null : end.failure).toMatchObject({ kind: "store-failed", reason: "append rejected" });
    expect(gone.done).toBe(true);
  });
});

describe("sdk hooks", () => {
  const target = { pipeline: {} as never };

  test("a run with a hook target and no wiring installed fails closed", async () => {
    const fake = fakeQuery(BASIC);
    const { end } = await collect(claudeSdkEngine({ query: fake.query }).start(runInput({ start: { hooks: target } })));
    expect(end.ok ? null : end.failure).toMatchObject({ kind: "unsupported", capability: "hooks", engine: "sdk" });
    expect(fake.calls).toHaveLength(0);
  });

  test("the callbacks go to the options and a deny the observer reports becomes a refused event", async () => {
    const fake = fakeQuery(async function* (options: ClaudeQueryOptions) {
      yield INIT;
      const body = options.hooks?.["PreToolUse"]?.[0]?.hooks[0];
      await body?.({ tool_name: "Bash" }, "tu-1", { signal: options.abortController.signal });
      yield ASSISTANT;
      yield RESULT;
    } as never);
    const engine = claudeSdkEngine({
      query: fake.query,
      hooks: (given, observer) => {
        expect(given).toBe(target);
        return {
          PreToolUse: [
            {
              hooks: [
                async () => {
                  observer.refused({ id: "tu-1", tool: "Bash", reason: "not allowed", text: "no" });
                  return { decision: "block" };
                },
              ],
            },
          ],
        };
      },
    });
    const { events, end } = await collect(engine.start(runInput({ start: { hooks: target } })));
    expect(events.find((event) => event.kind === "refused")).toEqual({ kind: "refused", id: "tu-1", tool: "Bash", source: "hook", reason: "not allowed", text: "no" });
    expect(end.ok).toBe(true);
    expect(fake.calls[0]?.options.hooks).toBeDefined();
  });
});

describe("sdk lazy loading", () => {
  test("creating the engine and describing a run never touches the SDK", () => {
    const engine = claudeSdkEngine();
    expect(engine.harness).toBe("claude");
    const input: AgentRunInput = runInput();
    expect(engine.describe(input).ok).toBe(true);
  });
});
