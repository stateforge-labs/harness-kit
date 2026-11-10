import { describe, expect, test } from "bun:test";
import type { AgentEvent } from "../../../src/agent/types.ts";
import { fail, ok } from "../../../src/core/result.ts";
import { fakeAgentEngine } from "../../../src/testing/index.ts";
import { collect, normalEvents, runInput, SESSION } from "./support/subjects.ts";

describe("fakeAgentEngine", () => {
  test("replays a script in order and ends with an output built from its events", async () => {
    const engine = fakeAgentEngine("claude", [{ events: normalEvents() }]);
    const run = engine.start(runInput());
    expect(await collect(run.events)).toEqual(normalEvents());
    const end = await run.done;
    expect(end.ok).toBe(true);
    if (end.ok) {
      expect(end.value.output.text).toBe("ok");
      expect(end.value.output.sessionId).toBe(SESSION);
      expect(end.value.output.checkpoint).toBe("checkpoint-1");
      expect(end.value.output.usage.map((entry) => entry.turn)).toEqual([1, 2]);
      expect(end.value.output.model).toBe("model-a");
      expect(end.value.stderrTail).toBe("");
    }
  });

  test("records every run input in starts, in order", () => {
    const engine = fakeAgentEngine("claude", [{ events: [] }, { events: [] }]);
    const first = runInput();
    const second = runInput();
    engine.start(first);
    engine.start(second);
    expect(engine.starts).toEqual([first, second]);
    expect(engine.starts[0]).toBe(first);
    expect(engine.harness).toBe("claude");
  });

  test("never emits finished, even when the script carries one", async () => {
    const finished: AgentEvent = { kind: "finished", result: fail({ kind: "no-output", message: "x" }) };
    const engine = fakeAgentEngine("claude", [{ events: [{ kind: "started", engine: "sdk" }, finished] }]);
    const run = engine.start(runInput());
    expect((await collect(run.events)).map((event) => event.kind)).toEqual(["started"]);
    expect((await run.done).ok).toBe(true);
  });

  test("a scripted result replaces the derived output", async () => {
    const failure = { kind: "max-turns", message: "turns", turns: 3 } as const;
    const engine = fakeAgentEngine("claude", [{ events: [{ kind: "started", engine: "sdk" }], result: fail(failure) }]);
    const run = engine.start(runInput());
    await collect(run.events);
    const end = await run.done;
    expect(end.ok).toBe(false);
    if (!end.ok) expect(end.failure).toEqual(failure);

    const output = { text: "given", output: null, sessionId: null, checkpoint: null, turns: 9, usage: [], model: null };
    const given = fakeAgentEngine("claude", [{ events: [], result: ok(output) }]).start(runInput());
    const givenEnd = await given.done;
    expect(givenEnd.ok && givenEnd.value.output).toEqual(output);
  });

  test("an exhausted script gives a FAKE-marked unavailable failure and no events", async () => {
    const engine = fakeAgentEngine("claude", []);
    const run = engine.start(runInput());
    expect(await collect(run.events)).toEqual([]);
    const end = await run.done;
    expect(end.ok).toBe(false);
    if (!end.ok) {
      expect(end.failure.kind).toBe("unavailable");
      expect(end.failure.message).toContain("FAKE");
    }
  });

  test("done resolves without anyone reading the events", async () => {
    const run = fakeAgentEngine("claude", [{ events: normalEvents() }]).start(runInput());
    expect((await run.done).ok).toBe(true);
  });

  test("cancel stops a delayed script and ends it as cancelled", async () => {
    const engine = fakeAgentEngine("claude", [{ events: normalEvents(), delayMs: 5000 }]);
    const run = engine.start(runInput());
    const started = Date.now();
    run.cancel();
    const end = await run.done;
    expect(Date.now() - started).toBeLessThan(1000);
    expect(end.ok).toBe(false);
    if (!end.ok) expect(end.failure.kind).toBe("cancelled");
    expect(await collect(run.events)).toEqual([]);
  });

  test("aborting the input signal cancels the run", async () => {
    const abort = new AbortController();
    const run = fakeAgentEngine("claude", [{ events: normalEvents(), delayMs: 5000 }]).start(runInput(abort.signal));
    abort.abort();
    const end = await run.done;
    expect(!end.ok && end.failure.kind).toBe("cancelled");
  });

  test("delayMs spaces the events", async () => {
    const run = fakeAgentEngine("claude", [{ events: normalEvents().slice(0, 3), delayMs: 30 }]).start(runInput());
    const started = Date.now();
    await run.done;
    expect(Date.now() - started).toBeGreaterThanOrEqual(80);
  });

  test("describe names the env it was given and never a value", () => {
    const engine = fakeAgentEngine("claude", []);
    const planned = engine.describe(runInput(undefined, { ANTHROPIC_API_KEY: "sk-visible-value" }));
    expect(planned.ok).toBe(true);
    if (planned.ok) {
      expect(planned.value.engine).toBe("sdk");
      expect(planned.value.env.inject).toEqual(["ANTHROPIC_API_KEY"]);
      expect(JSON.stringify(planned.value)).not.toContain("sk-visible-value");
    }
  });
});
