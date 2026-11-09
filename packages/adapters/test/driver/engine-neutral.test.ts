import { describe, expect, test } from "bun:test";
import { TOOLS_DEFAULT } from "../../src/core/policy.ts";
import { ok } from "../../src/core/result.ts";
import type { RunEvent } from "../../src/core/run.ts";
import { makeHandle } from "../../src/driver/handle.ts";
import type { EngineImpl } from "../../src/driver/engine.ts";
import { echoDriver, FAKE_PROFILE } from "../support/fake-driver.ts";
import { options, request } from "../support/prepare.ts";
import { runtimeCtx } from "../support/runtime.ts";

const calls: string[] = [];

const MEMORY: EngineImpl<"fake"> = {
  start(input) {
    calls.push(input.input);
    async function* events() {
      yield { kind: "started" as const };
      yield { kind: "text" as const, text: `heard ${input.input}` };
      yield { kind: "final" as const, text: `answer to ${input.input}` };
    }
    return { events: events(), cancel: () => {}, done: Promise.resolve(ok({ exit: { code: 0, signal: null }, stderrTail: "" })) };
  },
};

function memoryDriver() {
  return { ...echoDriver(), run: { engines: ["cli" as const], cli: MEMORY } };
}

async function collect(events: AsyncIterable<RunEvent>): Promise<RunEvent[]> {
  const out: RunEvent[] = [];
  for await (const event of events) {
    out.push(event);
  }
  return out;
}

describe("an engine that is not a process", () => {
  test("run reaches the engine with no program, argv or out file and spawns nothing", async () => {
    const { ctx } = runtimeCtx();
    const result = await makeHandle(ctx, memoryDriver(), "fake", options()).run(request({ input: "ping" }));
    expect(result.ok && result.value.text).toBe("answer to ping");
    expect(calls).toContain("ping");
  });

  test("stream yields started, text and finished only", async () => {
    const { ctx } = runtimeCtx();
    const events = await collect(makeHandle(ctx, memoryDriver(), "fake", options({ tools: TOOLS_DEFAULT })).stream(request({ input: "pong" })));
    expect(events.map((event) => event.kind)).toEqual(["started", "text", "finished"]);
    const last = events.at(-1);
    expect(last?.kind === "finished" && last.result.ok && last.result.value.confinement).toEqual([]);
  });

  test("plan names the harness binary and shows no argv", () => {
    const { ctx } = runtimeCtx();
    const planned = makeHandle(ctx, memoryDriver(), "fake", options()).plan(request());
    expect(planned.ok && planned.value.engine === "cli" && [planned.value.binary, planned.value.args]).toEqual([FAKE_PROFILE.binary, []]);
  });
});
