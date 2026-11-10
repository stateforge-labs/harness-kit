import { describe, expect, test } from "bun:test";
import { fail, ok } from "../../../src/core/result.ts";
import { secret } from "../../../src/core/secret.ts";
import type { AgentEvent } from "../../../src/agent/types.ts";
import { agentOf, BEARER, collect, endOf, failureOf, finishedOf, KEY, options, rig, startOf, usage } from "./support.ts";

const sessionNotFound = fail({ kind: "session-not-found" as const, message: "gone", sessionId: "s1" });
const resumeOf = (recoveryPrompt?: string) => ({ resume: { sessionId: "s1" as never, ...(recoveryPrompt === undefined ? {} : { recoveryPrompt }) } });

describe("the fold to settled", () => {
  test("a clean run ends with exactly one finished event, last, and settled matches it", async () => {
    const r = rig([{ events: [{ kind: "started", engine: "sdk" }, { kind: "text", text: "hi" }] }]);
    const run = agentOf(r).start(startOf());
    const events = await collect(run.events);
    expect(events.map((e) => e.kind)).toEqual(["started", "text", "finished"]);
    expect(events.filter((e) => e.kind === "finished")).toHaveLength(1);
    const settled = await run.settled;
    expect(settled).toEqual(finishedOf(events));
    expect(settled.ok && settled.value.text).toBe("done");
  });

  test("the engine receives the closed env, the key through the credential plan, and the redaction set", async () => {
    const bearer = { name: "docs", url: "http://127.0.0.1:1/mcp", bearer: secret(BEARER), allow: ["*"] };
    const r = rig([{}]);
    await agentOf(r, { ...options, tools: { ...options.tools, mcp: [bearer] } }).start(startOf()).settled;
    const input = r.engine.starts[0];
    expect(input?.env["FAKE_KEY_INJECTED"]).toBe(KEY);
    expect(input?.env["HOME"]).toBe("/w/home");
    expect(input?.env["TMPDIR"]).toBe("/w/tmp");
    expect(input?.env["AGENT_MCP_BEARER_0"]).toBe(BEARER);
    expect(Object.keys(input?.env ?? {}).sort()).toEqual(["AGENT_MCP_BEARER_0", "FAKE_KEY_INJECTED", "HOME", "PATH", "TMPDIR"]);
    expect(input?.secrets).toContain(KEY);
    expect(input?.secrets).toContain(BEARER);
    expect(input?.redact(`a ${BEARER} b ${KEY}`)).not.toContain("SENTINEL");
    expect(input?.runId).toMatch(/^\d+-\d+$/);
    expect(input?.signal.aborted).toBe(false);
  });

  test("an engine whose event stream throws still yields one finished event and settled does not reject", async () => {
    const r = rig([{ events: [{ kind: "text", text: "partial" }], throwAfter: true }]);
    const run = agentOf(r).start(startOf());
    const events = await collect(run.events);
    expect(events.map((e) => e.kind)).toEqual(["text", "finished"]);
    expect(failureOf(finishedOf(events)).kind).toBe("unavailable");
    expect(failureOf(await run.settled).kind).toBe("unavailable");
    expect(r.engine.cancels).toEqual([0]);
  });

  test("a finished event from the engine is dropped; the facet adds its own", async () => {
    const rogue: AgentEvent = { kind: "finished", result: ok(endOf().output), tree: "gone" };
    const r = rig([{ events: [rogue, { kind: "text", text: "x" }], result: fail({ kind: "no-output", message: "none" }) }]);
    const events = await collect(agentOf(r).start(startOf()).events);
    expect(events.map((e) => e.kind)).toEqual(["text", "finished"]);
    expect(failureOf(finishedOf(events)).kind).toBe("no-output");
  });

  test("an engine start that throws is an internal failure", async () => {
    const r = rig([{}]);
    const boom = { ...r.engine, start: () => { throw new Error("no"); } };
    const runtime = rig([{}], { agentEngines: { fake: boom } }).runtime;
    const made = runtime.agent("fake", options);
    if (!made.ok) throw new Error("refused");
    expect(failureOf(await made.value.start(startOf()).settled).kind).toBe("unavailable");
  });

  test("a consumer that never iterates still gets settled, and one that stops early does too", async () => {
    const many: AgentEvent[] = Array.from({ length: 50 }, (_, i) => ({ kind: "text" as const, text: String(i) }));
    const r = rig([{ events: many }]);
    const quiet = agentOf(r).start(startOf());
    expect((await quiet.settled).ok).toBe(true);
    const early = agentOf(r).start(startOf());
    for await (const event of early.events) {
      expect(event.kind).toBe("text");
      break;
    }
    expect((await early.settled).ok).toBe(true);
  });

  test("usage is accumulated unchanged, with no cost field", async () => {
    const r = rig([{ events: [usage(1), usage(2)] }]);
    const result = await agentOf(r).start(startOf()).settled;
    if (!result.ok) throw new Error("failed");
    expect(result.value.usage).toEqual([
      { turn: 1, model: "m", input: 10, cacheWrite: 2, cacheRead: 3, output: 4 },
      { turn: 2, model: "m", input: 10, cacheWrite: 2, cacheRead: 3, output: 4 },
    ]);
    expect(JSON.stringify(result.value)).not.toMatch(/cost|usd|price/i);
  });

  test("session, checkpoint and output events fill what the engine left null; deep json survives", async () => {
    let deep: unknown = "leaf";
    for (let i = 0; i < 30; i += 1) deep = { next: deep };
    const r = rig([{ events: [{ kind: "session", id: "sess-9" as never, checkpoint: "cp" }, { kind: "output", value: deep as never }] }]);
    const result = await agentOf(r).start(startOf()).settled;
    if (!result.ok) throw new Error("failed");
    expect(String(result.value.sessionId)).toBe("sess-9");
    expect(result.value.checkpoint).toBe("cp");
    expect(JSON.stringify(result.value.output)).toContain("leaf");
  });

  test("the capabilities and hook tables are published on the agent", () => {
    const agent = agentOf(rig([{}]));
    expect(agent.capabilities["resume"].state).toBe("supported");
    expect(Object.keys(agent.hooks).sort()).toEqual(["post-tool", "pre-tool", "prompt-submit", "session-start", "stop"]);
  });
});

describe("no secret in any event or failure", () => {
  test("text, failure messages and nested payloads are redacted", async () => {
    const leak = `token ${KEY} and ${BEARER}`;
    const bearer = { name: "docs", url: "http://127.0.0.1:1/mcp", bearer: secret(BEARER), allow: ["*"] };
    const failureWithKey = fail({ kind: "exit" as const, message: leak, code: 1, signal: null, stderrTail: leak });
    const r = rig([{ events: [{ kind: "text", text: leak }, { kind: "unrecognised", payload: { deep: [leak], [KEY]: 1 } }, { kind: "refused", id: "i", tool: leak, source: "hook", reason: leak, text: leak }], result: failureWithKey }]);
    const run = agentOf(r, { ...options, tools: { ...options.tools, mcp: [bearer] } }).start(startOf());
    const events = await collect(run.events);
    const text = JSON.stringify([events, await run.settled]);
    expect(text).not.toContain(KEY);
    expect(text).not.toContain(BEARER);
    expect(text).toContain("[redacted]");
  });

  test("a successful output is redacted too", async () => {
    const r = rig([{ result: ok(endOf({ text: `the key is ${KEY}`, output: { k: KEY } })) }]);
    const result = await agentOf(r).start(startOf()).settled;
    expect(JSON.stringify(result)).not.toContain(KEY);
  });
});

describe("recovery", () => {
  test("a missing session with a recovery prompt makes exactly one fresh run", async () => {
    const r = rig([
      { events: [{ kind: "started", engine: "sdk" }], result: sessionNotFound },
      { events: [{ kind: "started", engine: "sdk" }, { kind: "text", text: "fresh" }] },
    ]);
    const run = agentOf(r).start(startOf(resumeOf("start over")));
    const events = await collect(run.events);
    expect(events.map((e) => e.kind)).toEqual(["recovered", "started", "text", "finished"]);
    expect(events[0]).toEqual({ kind: "recovered", reason: "session-not-found" });
    expect((await run.settled).ok).toBe(true);
    expect(r.engine.starts).toHaveLength(2);
    expect(r.engine.starts[1]?.start.prompt).toBe("start over");
    expect(r.engine.starts[1]?.start.resume).toBeUndefined();
    expect(r.engine.starts[1]?.runId).not.toBe(r.engine.starts[0]?.runId);
    expect(r.engine.starts[0]?.start.prompt).toBe("hello");
  });

  test("the second run is never retried", async () => {
    const r = rig([{ events: [{ kind: "started", engine: "sdk" }], result: sessionNotFound }, { events: [{ kind: "started", engine: "sdk" }], result: sessionNotFound }]);
    const run = agentOf(r).start(startOf(resumeOf("again")));
    const events = await collect(run.events);
    expect(events.map((e) => e.kind)).toEqual(["recovered", "started", "finished"]);
    expect(failureOf(await run.settled).kind).toBe("session-not-found");
    expect(r.engine.starts).toHaveLength(2);
  });

  test("without a recovery prompt the miss is session-not-found and started is kept", async () => {
    const r = rig([{ events: [{ kind: "started", engine: "sdk" }], result: sessionNotFound }]);
    const run = agentOf(r).start(startOf(resumeOf()));
    const events = await collect(run.events);
    expect(events.map((e) => e.kind)).toEqual(["started", "finished"]);
    expect(failureOf(await run.settled).kind).toBe("session-not-found");
    expect(r.engine.starts).toHaveLength(1);
  });

  test("after an assistant message there is no recovery", async () => {
    const r = rig([{ events: [{ kind: "started", engine: "sdk" }, { kind: "text", text: "hm" }], result: sessionNotFound }]);
    const run = agentOf(r).start(startOf(resumeOf("again")));
    const events = await collect(run.events);
    expect(events.map((e) => e.kind)).toEqual(["started", "text", "finished"]);
    expect(r.engine.starts).toHaveLength(1);
  });

  test("a different failure is not recovered", async () => {
    const r = rig([{ events: [{ kind: "started", engine: "sdk" }], result: fail({ kind: "no-output", message: "none" }) }]);
    const run = agentOf(r).start(startOf(resumeOf("again")));
    const events = await collect(run.events);
    expect(events.map((e) => e.kind)).toEqual(["started", "finished"]);
    expect(r.engine.starts).toHaveLength(1);
  });
});
