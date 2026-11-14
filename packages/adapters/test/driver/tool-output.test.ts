import { describe, expect, test } from "bun:test";
import { ToolClass } from "../../src/constants.ts";
import { ok } from "../../src/core/result.ts";
import { makeHandle } from "../../src/driver/handle.ts";
import type { EngineEvent, EngineImpl } from "../../src/driver/engine.ts";
import { echoDriver } from "../support/fake-driver.ts";
import { options, request } from "../support/prepare.ts";
import { runtimeCtx } from "../support/runtime.ts";

function scripted(events: readonly EngineEvent[]) {
  const engine: EngineImpl<"fake"> = {
    start() {
      async function* stream() {
        for (const event of events) {
          yield event;
        }
      }
      return { events: stream(), cancel: () => {}, done: Promise.resolve(ok({ exit: { code: 0, signal: null }, stderrTail: "" })) };
    },
  };
  return { ...echoDriver(), run: { engines: ["cli" as const], cli: engine } };
}

async function runWith(events: readonly EngineEvent[]) {
  const { ctx } = runtimeCtx();
  return makeHandle(ctx, scripted(events), "fake", options()).run(request({ input: "ping" }));
}

describe("tool calls and structured output in a run", () => {
  test("tool calls and output reach RunOutput", async () => {
    const result = await runWith([
      { kind: "started" },
      { kind: "tool-call", id: "t1", name: "record_colour", class: ToolClass.Other, target: null, args: { colour: "blue" } },
      { kind: "tool-result", id: "t1", result: "accepted: blue", error: null },
      { kind: "output", value: { ops: [] } },
      { kind: "final", text: "done" },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.tools).toEqual([{ id: "t1", name: "record_colour", args: { colour: "blue" }, result: "accepted: blue", error: null, refused: false }]);
    expect(result.value.output).toEqual({ ops: [] });
  });

  test("a refusal marks the call refused", async () => {
    const result = await runWith([
      { kind: "started" },
      { kind: "tool-call", id: "t2", name: "record_colour", class: ToolClass.Other, target: null, args: null },
      { kind: "tool-refused", id: "t2", name: "record_colour", reason: "blocked by policy" },
      { kind: "final", text: "done" },
    ]);
    expect(result.ok && result.value.tools).toEqual([{ id: "t2", name: "record_colour", args: null, result: null, error: "blocked by policy", refused: true }]);
  });

  test("no tool events leave tools and output absent", async () => {
    const result = await runWith([{ kind: "started" }, { kind: "final", text: "done" }]);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect("tools" in result.value).toBe(false);
    expect("output" in result.value).toBe(false);
  });

  test("a tool-server-failed failure is the run result", async () => {
    const result = await runWith([
      { kind: "started" },
      { kind: "failure", failure: { kind: "tool-server-failed", message: "a tool server failed to start", server: "probe" } },
    ]);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.failure.kind === "tool-server-failed" && result.failure.server).toBe("probe");
  });
});
