import { describe, expect, test } from "bun:test";
import { claudeSdkEngine } from "../../../src/claude/engines/sdk.ts";
import { ASSISTANT, BASIC, INIT, KEY, RESULT, SESSION, collect, fakeQuery, kinds, runInput, toolAssistant, withUuid } from "./support.ts";

function start(messages: readonly unknown[], parts: Parameters<typeof runInput>[0] = {}) {
  const fake = fakeQuery(messages);
  return { fake, run: claudeSdkEngine({ query: fake.query }).start(runInput(parts)) };
}

describe("sdk events on the captured shapes", () => {
  test("a plain run streams started, session, turn, text, usage and finishes with the capture's numbers", async () => {
    const { run } = start(BASIC);
    const { events, end } = await collect(run);
    expect(kinds(events)).toEqual(["started", "session", "turn", "text", "session", "usage"]);
    expect(events[0]).toEqual({ kind: "started", engine: "sdk" });
    expect(events[1]).toEqual({ kind: "session", id: SESSION, checkpoint: null });
    expect(events[3]).toEqual({ kind: "text", text: "ok" });
    expect(events[4]).toEqual({ kind: "session", id: SESSION, checkpoint: ASSISTANT["uuid"] as string });
    expect(events[5]).toEqual({ kind: "usage", turn: 1, model: "claude-fable-5-2", input: 2, cacheWrite: 51626, cacheRead: 0, output: 4 });
    expect(end.ok).toBe(true);
    if (end.ok) {
      expect(end.value.output).toEqual({
        text: RESULT["result"] as string,
        output: null,
        sessionId: SESSION,
        checkpoint: ASSISTANT["uuid"] as string,
        turns: RESULT["num_turns"] as number,
        usage: [{ turn: 1, model: "claude-fable-5-2", input: 2, cacheWrite: 51626, cacheRead: 0, output: 4 }],
        model: "claude-fable-5-2",
      });
    }
  });

  test("the rate limit row is ignored and an unknown row is unrecognised and redacted", async () => {
    const { run } = start([INIT, { type: "weather", note: `contains ${KEY}` }, ASSISTANT, RESULT]);
    const { events } = await collect(run);
    const odd = events.find((event) => event.kind === "unrecognised");
    expect(odd).toEqual({ kind: "unrecognised", payload: { type: "weather", note: "contains [redacted]" } });
    expect(JSON.stringify(events)).not.toContain(KEY);
  });

  test("the usage of one model message counts once however many blocks carry it", async () => {
    const second = withUuid(ASSISTANT, "uuid-2");
    const { run } = start([INIT, ASSISTANT, second, RESULT]);
    const { events, end } = await collect(run);
    expect(events.filter((event) => event.kind === "usage")).toHaveLength(1);
    expect(events.filter((event) => event.kind === "turn")).toHaveLength(1);
    expect(end.ok && end.value.output.checkpoint).toBe("uuid-2");
  });

  test("each model message is a turn with its own raw usage", async () => {
    const tool = toolAssistant({ id: "msg-a", uuid: "uuid-a", tool: "mcp__srv__echo", toolId: "tu-1", input: { path: "/x" } });
    const second = withUuid(ASSISTANT, "uuid-b", "msg-b");
    const init = { ...INIT, tools: ["mcp__srv__echo"] };
    const { run } = start([init, tool, second, RESULT]);
    const { events, end } = await collect(run);
    expect(events.filter((event) => event.kind === "turn")).toEqual([
      { kind: "turn", n: 1 },
      { kind: "turn", n: 2 },
    ]);
    expect(events.find((event) => event.kind === "tool")).toEqual({ kind: "tool", id: "tu-1", name: "mcp__srv__echo", class: "other", target: "/x" });
    expect(end.ok && end.value.output.usage.map((usage) => usage.turn)).toEqual([1, 2]);
  });

  test("a tool the init list does not name is refused once per tool id", async () => {
    const ghost = toolAssistant({ id: "msg-a", uuid: "uuid-a", tool: "Bash", toolId: "tu-9" });
    const again = toolAssistant({ id: "msg-a", uuid: "uuid-b", tool: "Bash", toolId: "tu-9" });
    const { run } = start([INIT, ghost, again, RESULT]);
    const { events } = await collect(run);
    const refused = events.filter((event) => event.kind === "refused");
    expect(refused).toEqual([{ kind: "refused", id: "tu-9", tool: "Bash", source: "unknown-tool", reason: "tool-not-listed-at-init", text: null }]);
  });

  test("a listed tool and the structured output tool are not refused", async () => {
    const listed = toolAssistant({ id: "msg-a", uuid: "uuid-a", tool: "mcp__srv__echo", toolId: "tu-1" });
    const synthetic = toolAssistant({ id: "msg-b", uuid: "uuid-b", tool: "StructuredOutput", toolId: "tu-2" });
    const { run } = start([{ ...INIT, tools: ["mcp__srv__echo"] }, listed, synthetic, RESULT]);
    const { events } = await collect(run);
    expect(events.some((event) => event.kind === "refused")).toBe(false);
  });

  test("a structured result becomes an output event and the output", async () => {
    const { run } = start([INIT, ASSISTANT, { ...RESULT, structured_output: { ok: true } }], { start: { outputSchema: { type: "object" } } });
    const { events, end } = await collect(run);
    expect(events.find((event) => event.kind === "output")).toEqual({ kind: "output", value: { ok: true } });
    expect(end.ok && end.value.output.output).toEqual({ ok: true });
  });

  test("a schema run whose result has no structured output ends with no-output", async () => {
    const { run } = start(BASIC, { start: { outputSchema: { type: "object" } } });
    const { end } = await collect(run);
    expect(end.ok).toBe(false);
    if (!end.ok) {
      expect(end.failure.kind).toBe("no-output");
    }
  });

  test("no finished event is ever produced by the engine", async () => {
    const { run } = start(BASIC);
    const { events } = await collect(run);
    expect(events.some((event) => event.kind === "finished")).toBe(false);
  });
});
