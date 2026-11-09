import { describe, expect, test } from "bun:test";
import { unparsable } from "../../src/core/kit.ts";
import { asSessionId } from "../../src/core/session.ts";
import type { EngineEnd, EngineEvent } from "../../src/driver/engine.ts";
import { foldEnd, foldStart, foldStep } from "../../src/driver/fold.ts";

const CLEAN: EngineEnd = { exit: { code: 0, signal: null }, stderrTail: "" };

function folded(events: readonly EngineEvent[], end: EngineEnd = CLEAN, requestedModel: string | null = null) {
  return foldEnd(events.reduce(foldStep, foldStart()), end, requestedModel);
}

function valueOf(result: ReturnType<typeof folded>) {
  if (!result.ok) {
    throw new Error("expected ok");
  }
  return result.value;
}

describe("fold", () => {
  test("concatenates text events when there is no final", () => {
    expect(valueOf(folded([{ kind: "text", text: "he" }, { kind: "text", text: "llo" }])).text).toBe("hello");
  });

  test("the last final replaces the streamed text", () => {
    const run = valueOf(folded([{ kind: "text", text: "he" }, { kind: "final", text: "one" }, { kind: "final", text: "two" }]));
    expect(run.text).toBe("two");
  });

  test("the streamed flag is set only by text events", () => {
    const start = foldStart();
    expect(foldStep(start, { kind: "final", text: "x" }).streamed).toBe(false);
    expect(foldStep(start, { kind: "text", text: "x" }).streamed).toBe(true);
  });

  test("the first failure wins", () => {
    const result = folded([
      { kind: "text", text: "ok" },
      { kind: "failure", failure: unparsable("first") },
      { kind: "failure", failure: unparsable("second") },
    ]);
    expect(!result.ok && result.failure).toMatchObject({ kind: "unparsable", reason: "first" });
  });

  test("a non-zero exit gives an exit failure with the stderr tail", () => {
    const result = folded([{ kind: "text", text: "ok" }], { exit: { code: 2, signal: null }, stderrTail: "bad" });
    expect(!result.ok && result.failure).toMatchObject({ kind: "exit", code: 2, stderrTail: "bad" });
  });

  test("a signal exit is an exit failure", () => {
    const result = folded([{ kind: "text", text: "ok" }], { exit: { code: null, signal: "SIGKILL" }, stderrTail: "" });
    expect(!result.ok && result.failure.kind).toBe("exit");
  });

  test("an exit failure raised before the exit is known takes the real exit code", () => {
    const result = folded(
      [{ kind: "failure", failure: { kind: "exit", message: "m", code: null, signal: null, stderrTail: "from the stream" } }],
      { exit: { code: 7, signal: null }, stderrTail: "" },
    );
    expect(!result.ok && result.failure).toMatchObject({ kind: "exit", code: 7, stderrTail: "from the stream" });
  });

  test("empty text is unparsable", () => {
    const result = folded([{ kind: "usage", usage: foldStart().usage }]);
    expect(!result.ok && result.failure).toMatchObject({ kind: "unparsable", reason: "empty-text" });
  });

  test("the model falls back to the requested model", () => {
    expect(valueOf(folded([{ kind: "text", text: "a" }], CLEAN, "asked")).model).toBe("asked");
    expect(valueOf(folded([{ kind: "text", text: "a" }, { kind: "model", model: "seen" }], CLEAN, "asked")).model).toBe("seen");
    expect(valueOf(folded([{ kind: "text", text: "a" }])).model).toBeNull();
  });

  test("cost events add up and keep the last basis", () => {
    const run = valueOf(
      folded([
        { kind: "text", text: "a" },
        { kind: "cost", cost: { usd: 0.25, basis: "list" } },
        { kind: "cost", cost: { usd: 0.5, basis: "list" } },
      ]),
    );
    expect(run.cost).toEqual({ usd: 0.75, basis: "list" });
  });

  test("with no cost event the cost is unreported", () => {
    expect(valueOf(folded([{ kind: "text", text: "a" }])).cost).toEqual({ usd: null, basis: "unreported" });
  });

  test("an unavailable cost event replaces the default", () => {
    expect(valueOf(folded([{ kind: "text", text: "a" }, { kind: "cost", cost: { usd: null, basis: "unavailable" } }])).cost).toEqual({ usd: null, basis: "unavailable" });
  });

  test("usage, session and unrecognised payloads are carried", () => {
    const usage = { ...foldStart().usage, inputTokens: 3 };
    const id = asSessionId("s-1");
    if (id === null) {
      throw new Error("expected a session id");
    }
    const run = valueOf(
      folded([
        { kind: "text", text: "a" },
        { kind: "usage", usage },
        { kind: "session", id },
        { kind: "unrecognised", payload: { odd: 1 } },
      ]),
    );
    expect(run.usage).toEqual(usage);
    expect(run.sessionId).toBe(id);
    expect(run.unrecognised).toEqual([{ odd: 1 }]);
  });

  test("stepping does not change the previous fold", () => {
    const start = foldStart();
    foldStep(start, { kind: "text", text: "x" });
    expect(start.text).toBe("");
  });
});
