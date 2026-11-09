import { describe, expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import { ok } from "../../src/core/result.ts";
import { unparsable } from "../../src/core/kit.ts";
import { KILL_GRACE_MS, Signal } from "../../src/driver/constants.ts";
import { nextRunId } from "../../src/driver/context.ts";
import type { EngineEvent } from "../../src/driver/engine.ts";
import type { ProcessExit, ProcessRunner, RunningProcess } from "../../src/driver/ports.ts";
import { cliEngine } from "../../src/engine/cli.ts";
import { fakeClock } from "../support/fakes.ts";
import { ioWith, runInput } from "../support/interpret.ts";
import { runtimeCtx } from "../support/runtime.ts";
import { chunkedRunner } from "../support/chunked-runner.ts";
import { fakeInvocationOnly } from "../support/engine-parts.ts";

interface Gate {
  readonly runner: ProcessRunner;
  readonly signals: Signal[];
  push(text: string): void;
  end(code: number): void;
}

function gatedRunner(): Gate {
  const signals: Signal[] = [];
  const queue: (string | null)[] = [];
  let wake: () => void = () => {};
  let resolveExit: (exit: ProcessExit) => void = () => {};
  const exited = new Promise<ProcessExit>((resolve) => {
    resolveExit = resolve;
  });
  async function* stdout(): AsyncGenerator<Uint8Array> {
    for (;;) {
      const next = queue.shift();
      if (next === undefined) {
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
        continue;
      }
      if (next === null) {
        return;
      }
      yield Buffer.from(next);
    }
  }
  async function* silent(): AsyncGenerator<Uint8Array> {}
  const running: RunningProcess = {
    pid: null,
    stdout: stdout(),
    stderr: silent(),
    exited,
    signalGroup(signal) {
      signals.push(signal);
      if (signal === Signal.Kill || signal === Signal.Term) {
        queue.push(null);
        resolveExit({ code: null, signal });
        wake();
      }
    },
  };
  return {
    runner: async () => ok(running),
    signals,
    push(text) {
      queue.push(text);
      wake();
    },
    end(code) {
      queue.push(null);
      resolveExit({ code, signal: null });
      wake();
    },
  };
}

const lineEngine = cliEngine<"fake">({
  invocation: fakeInvocationOnly,
  parseLine: (line) => (line === "" ? [] : [{ kind: "text", text: line }]),
});

describe("cliEngine start", () => {
  test("yields text events before the process exits", async () => {
    const gate = gatedRunner();
    const run = lineEngine.start(runInput(), ioWith(gate.runner));
    const iterator = run.events[Symbol.asyncIterator]();
    gate.push("first\n");
    const first = await iterator.next();
    expect(first.done).toBe(false);
    expect(first.value).toEqual({ kind: "text", text: "first" });
    let settled = false;
    void run.done.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    gate.end(0);
    const rest = await iterator.next();
    expect(rest.done).toBe(true);
    const done = await run.done;
    expect(done.ok && done.value.exit.code).toBe(0);
  });

  test("a partial last line is parsed when the stream ends", async () => {
    const { runner } = chunkedRunner([{ chunks: ["one\ntw", "o"] }]);
    const run = lineEngine.start(runInput(), ioWith(runner));
    const seen: EngineEvent[] = [];
    for await (const event of run.events) {
      seen.push(event);
    }
    expect(seen).toEqual([
      { kind: "text", text: "one" },
      { kind: "text", text: "two" },
    ]);
  });

  test("each line is redacted before parseLine reads it", async () => {
    const { runner } = chunkedRunner([{ chunks: ["key sk-SECRET here\n"] }]);
    const run = lineEngine.start(runInput({ redact: (text) => text.replace("sk-SECRET", "[redacted]") }), ioWith(runner));
    const seen: EngineEvent[] = [];
    for await (const event of run.events) {
      seen.push(event);
    }
    expect(seen).toEqual([{ kind: "text", text: "key [redacted] here" }]);
  });

  test("a throwing parseLine becomes one internal-error failure event and the run still ends ok", async () => {
    const { runner } = chunkedRunner([{ chunks: ["a\nb\n"] }]);
    const engine = cliEngine<"fake">({
      invocation: fakeInvocationOnly,
      parseLine: () => {
        throw new Error("boom");
      },
    });
    const run = engine.start(runInput(), ioWith(runner));
    const seen: EngineEvent[] = [];
    for await (const event of run.events) {
      seen.push(event);
    }
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ kind: "failure", failure: { kind: "unavailable", reason: "internal-error" } });
    expect((await run.done).ok).toBe(true);
  });

  test("after runs once after exit with the stdout tail and the out file text, and its events come last", async () => {
    const { runner } = chunkedRunner([{ chunks: ["x\ny\n"], stderr: "warn" }]);
    const contexts: { stdoutTail: string; outFileText: string | null; stderrTail: string }[] = [];
    const engine = cliEngine<"fake">({
      invocation: fakeInvocationOnly,
      parseLine: (line) => (line === "" ? [] : [{ kind: "text", text: line }]),
      after: (ctx) => {
        contexts.push({ stdoutTail: ctx.stdoutTail, outFileText: ctx.outFileText, stderrTail: ctx.end.stderrTail });
        return Promise.resolve([{ kind: "final", text: "done" }]);
      },
    });
    const run = engine.start(runInput({ outFile: "/work/out.txt" }), ioWith(runner, { "/work/out.txt": "from file" }));
    const seen: EngineEvent[] = [];
    for await (const event of run.events) {
      seen.push(event);
    }
    expect(seen.map((event) => event.kind)).toEqual(["text", "text", "final"]);
    expect(contexts).toEqual([{ stdoutTail: "x\ny\n", outFileText: "from file", stderrTail: "warn" }]);
  });

  test("after does not run when the process fails, and done carries the exit failure", async () => {
    const { runner } = chunkedRunner([{ chunks: ["x\n"], code: 3 }]);
    let ran = false;
    const engine = cliEngine<"fake">({
      invocation: fakeInvocationOnly,
      parseLine: () => [],
      after: () => {
        ran = true;
        return Promise.resolve([]);
      },
    });
    const run = engine.start(runInput(), ioWith(runner));
    for await (const event of run.events) {
      void event;
    }
    const done = await run.done;
    expect(ran).toBe(false);
    expect(!done.ok && done.failure.kind).toBe("exit");
  });

  test("an after that throws becomes an internal-error failure event", async () => {
    const { runner } = chunkedRunner([{ chunks: ["x\n"] }]);
    const engine = cliEngine<"fake">({
      invocation: fakeInvocationOnly,
      parseLine: () => [],
      after: () => Promise.reject(new Error("late")),
    });
    const run = engine.start(runInput(), ioWith(runner));
    const seen: EngineEvent[] = [];
    for await (const event of run.events) {
      seen.push(event);
    }
    expect(seen[0]).toMatchObject({ kind: "failure", failure: { reason: "internal-error" } });
  });

  test("cancel stops a running process with SIGTERM and done reports aborted", async () => {
    const gate = gatedRunner();
    const run = lineEngine.start(runInput(), ioWith(gate.runner));
    const iterator = run.events[Symbol.asyncIterator]();
    gate.push("one\n");
    await iterator.next();
    const pending = iterator.next();
    run.cancel();
    expect((await pending).done).toBe(true);
    const done = await run.done;
    expect(!done.ok && done.failure.kind).toBe("aborted");
    expect(gate.signals[0]).toBe(Signal.Term);
  });

  test("cancel before the events are read resolves done as aborted", async () => {
    const run = lineEngine.start(runInput(), ioWith(chunkedRunner([{ chunks: ["x\n"] }]).runner));
    run.cancel();
    const done = await run.done;
    expect(!done.ok && done.failure.kind).toBe("aborted");
  });

  test("a timeout ends the run with a timeout failure and kills after the grace period", async () => {
    const gate = gatedRunner();
    const clock = fakeClock(0);
    const io = { ...ioWith(gate.runner), clock };
    const run = lineEngine.start(runInput({ timeoutMs: 100 }), io);
    const draining = (async () => {
      for await (const event of run.events) {
        void event;
      }
    })();
    await Promise.resolve();
    await Promise.resolve();
    clock.advance(100);
    clock.advance(KILL_GRACE_MS);
    await draining;
    const done = await run.done;
    expect(!done.ok && done.failure.kind).toBe("timeout");
  });

  test("leaving the event loop early stops the process", async () => {
    const gate = gatedRunner();
    const run = lineEngine.start(runInput(), ioWith(gate.runner));
    gate.push("one\n");
    for await (const event of run.events) {
      void event;
      break;
    }
    const done = await run.done;
    expect(!done.ok && done.failure.kind).toBe("aborted");
    expect(gate.signals).toContain(Signal.Term);
  });

  test("helpArgs default to null and checkHelp to accepting", () => {
    expect(lineEngine.helpArgs).toBeNull();
    expect(lineEngine.checkHelp("anything")).toEqual({ ok: true, value: null });
  });

  test("parseLine is exposed unchanged", () => {
    expect(lineEngine.parseLine("q")).toEqual([{ kind: "text", text: "q" }]);
    expect(unparsable("x").kind).toBe("unparsable");
  });
});

describe("nextRunId", () => {
  test("ids differ across calls even at the same clock reading", () => {
    const { ctx } = runtimeCtx();
    const first = nextRunId(ctx);
    const second = nextRunId(ctx);
    expect(first).not.toBe(second);
    expect(first).toBe("0-1");
    expect(second).toBe("0-2");
  });
});
