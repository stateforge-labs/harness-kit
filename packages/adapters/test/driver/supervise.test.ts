import { describe, expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import type { RunFailure } from "../../src/core/failure.ts";
import { redactor } from "../../src/core/redact.ts";
import { fail, ok, type Result } from "../../src/core/result.ts";
import { UnavailableReason } from "../../src/core/failure.ts";
import { DRAIN_GRACE_MS, KILL_GRACE_MS, Signal, SpawnCode } from "../../src/driver/constants.ts";
import { nodeClock, nodeRunner } from "../../src/driver/node-defaults.ts";
import type { ProcessRunner, ProcessSpec, SpawnError } from "../../src/driver/ports.ts";
import { type SuperviseDone, supervise, type SuperviseInput } from "../../src/driver/supervise.ts";
import { fakeClock, fakeProcessRunner } from "../support/fakes.ts";
import { STREAM_CHUNK_BYTES, streamRunner } from "../support/stream-runner.ts";

const SPEC: ProcessSpec = { program: "p", args: [], env: {}, cwd: "/", stdin: null };
const LIMITS = { maxStdoutBytes: 8_388_608, maxStderrBytes: 65_536 };
const SECRET = "secret-token";

type Outcome = { readonly texts: string[]; readonly result: Result<SuperviseDone, RunFailure> };

function input(overrides: Partial<SuperviseInput> & Pick<SuperviseInput, "runner">): SuperviseInput {
  return {
    spec: SPEC,
    signal: undefined,
    timeoutMs: undefined,
    limits: LIMITS,
    clock: fakeClock(0),
    redact: redactor([SECRET]),
    ...overrides,
  };
}

function run(config: SuperviseInput): Promise<Outcome> {
  return (async () => {
    const texts: string[] = [];
    const generator = supervise(config);
    for (;;) {
      const step = await generator.next();
      if (step.done === true) {
        return { texts, result: step.value };
      }
      texts.push(step.value);
    }
  })();
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function chunkedRunner(chunks: readonly string[], code: number): ProcessRunner {
  return async () => {
    async function* none(): AsyncGenerator<Uint8Array> {}
    async function* parts(): AsyncGenerator<Uint8Array> {
      for (const chunk of chunks) {
        yield Buffer.from(chunk);
      }
    }
    return ok({
      pid: 1,
      stdout: none(),
      stderr: parts(),
      exited: Promise.resolve({ code, signal: null }),
      signalGroup() {},
    });
  };
}

function failing(code: SpawnError["code"]): ProcessRunner {
  return async () => fail({ code, message: "spawn" });
}

describe("supervise", () => {
  test("a pre-aborted signal fails before spawning", async () => {
    const fake = fakeProcessRunner([{ stdout: "never" }]);
    const controller = new AbortController();
    controller.abort();
    const outcome = await run(input({ runner: fake.runner, signal: controller.signal }));
    expect(outcome.result.ok).toBe(false);
    expect(fake.specs).toEqual([]);
  });

  test("a normal exit yields stdout and succeeds", async () => {
    const fake = fakeProcessRunner([{ stdout: "hello" }]);
    const outcome = await run(input({ runner: fake.runner }));
    expect(outcome.texts.join("")).toBe("hello");
    expect(outcome.result).toEqual({
      ok: true,
      value: { stdout: "hello", stderrTail: "", exit: { code: 0, signal: null } },
    });
  });

  test("a non-zero exit carries a redacted stderr tail", async () => {
    const fake = fakeProcessRunner([{ stderr: `boom ${SECRET}`, code: 2 }]);
    const outcome = await run(input({ runner: fake.runner }));
    expect(outcome.result.ok).toBe(false);
    if (outcome.result.ok) {
      return;
    }
    expect(outcome.result.failure).toMatchObject({ kind: "exit", code: 2, signal: null });
    const tail = JSON.stringify(outcome.result.failure);
    expect(tail).toContain("[redacted]");
    expect(tail).not.toContain(SECRET);
  });

  test("a secret split across stderr chunks is redacted", async () => {
    const outcome = await run(input({ runner: chunkedRunner(["sec", "ret-to", "ken-tail"], 1) }));
    expect(outcome.result.ok).toBe(false);
    if (outcome.result.ok) {
      return;
    }
    const tail = JSON.stringify(outcome.result.failure);
    expect(tail).toContain("[redacted]");
    expect(tail).not.toContain("secret");
  });

  test("a timeout sends SIGTERM, then SIGKILL after the grace period", async () => {
    const clock = fakeClock(0);
    const fake = fakeProcessRunner([{ hold: true, ignoreTerm: true }]);
    const pending = run(input({ runner: fake.runner, clock, timeoutMs: 100 }));
    await flush();
    clock.advance(100);
    await flush();
    expect(fake.signals).toEqual([Signal.Term]);
    clock.advance(KILL_GRACE_MS);
    const outcome = await pending;
    expect(fake.signals).toEqual([Signal.Term, Signal.Kill]);
    expect(outcome.result).toEqual({
      ok: false,
      failure: { kind: "timeout", message: "the run exceeded its timeout", timeoutMs: 100 },
    });
  });

  test("an abort mid-run stops the child", async () => {
    const fake = fakeProcessRunner([{ hold: true }]);
    const controller = new AbortController();
    const pending = run(input({ runner: fake.runner, signal: controller.signal }));
    await flush();
    controller.abort();
    const outcome = await pending;
    expect(fake.signals).toEqual([Signal.Term]);
    expect(outcome.result).toEqual({ ok: false, failure: { kind: "aborted", message: "the run was aborted" } });
  });

  test("the first stop reason wins when a timeout precedes an abort", async () => {
    const clock = fakeClock(0);
    const fake = fakeProcessRunner([{ hold: true, ignoreTerm: true }]);
    const controller = new AbortController();
    const pending = run(input({ runner: fake.runner, clock, signal: controller.signal, timeoutMs: 100 }));
    await flush();
    clock.advance(100);
    await flush();
    controller.abort();
    clock.advance(KILL_GRACE_MS);
    const outcome = await pending;
    expect(outcome.result.ok).toBe(false);
    if (!outcome.result.ok) {
      expect(outcome.result.failure.kind).toBe("timeout");
    }
  });

  test("the first stop reason wins when an abort precedes a timeout", async () => {
    const clock = fakeClock(0);
    const fake = fakeProcessRunner([{ hold: true, ignoreTerm: true }]);
    const controller = new AbortController();
    const pending = run(input({ runner: fake.runner, clock, signal: controller.signal, timeoutMs: 100 }));
    await flush();
    controller.abort();
    await flush();
    clock.advance(100);
    clock.advance(KILL_GRACE_MS);
    const outcome = await pending;
    expect(outcome.result.ok).toBe(false);
    if (!outcome.result.ok) {
      expect(outcome.result.failure.kind).toBe("aborted");
    }
  });

  test("stdout over the limit fails with output-too-large", async () => {
    const fake = fakeProcessRunner([{ stdout: "x".repeat(2000) }]);
    const outcome = await run(input({ runner: fake.runner, limits: { maxStdoutBytes: 1024, maxStderrBytes: 65_536 } }));
    expect(outcome.result).toEqual({
      ok: false,
      failure: {
        kind: "output-too-large",
        message: "the harness wrote more stdout than the limit allows",
        limitBytes: 1024,
        actualBytes: 2000,
      },
    });
  });

  test("a consumer that returns early kills the child", async () => {
    const fake = fakeProcessRunner([{ hold: true, stdout: "hi" }]);
    const generator = supervise(input({ runner: fake.runner }));
    const first = await generator.next();
    expect(first).toEqual({ done: false, value: "hi" });
    await generator.return(undefined as never);
    expect(fake.signals).toEqual([Signal.Term]);
  });

  test("a missing binary fails as unavailable binary-missing", async () => {
    const outcome = await run(input({ runner: failing(SpawnCode.NotFound) }));
    expect(outcome.result).toEqual({
      ok: false,
      failure: {
        kind: "unavailable",
        message: "the harness binary was not found",
        reason: UnavailableReason.BinaryMissing,
      },
    });
  });

  test("an oversized argv fails as too-large on the environment field", async () => {
    const spec: ProcessSpec = { ...SPEC, args: ["a".repeat(10)] };
    const outcome = await run(input({ runner: failing(SpawnCode.ArgvTooBig), spec }));
    expect(outcome.result.ok).toBe(false);
    if (!outcome.result.ok) {
      expect(outcome.result.failure).toMatchObject({ kind: "too-large", field: "environment" });
    }
  });

  test("pipes that outlive the exit are killed once after the drain grace", async () => {
    const clock = fakeClock(0);
    const fake = fakeProcessRunner([{ stdout: "ok", pipesOutliveExit: true }]);
    const pending = run(input({ runner: fake.runner, clock }));
    await flush();
    clock.advance(DRAIN_GRACE_MS);
    const outcome = await pending;
    expect(fake.signals).toEqual([Signal.Kill]);
    expect(outcome.texts.join("")).toBe("ok");
    expect(outcome.result.ok).toBe(true);
  });

  test("a 1 MB stderr with stdout does not deadlock", async () => {
    const fake = fakeProcessRunner([{ stdout: "ok", stderr: "e".repeat(1_000_000) }]);
    const outcome = await run(input({ runner: fake.runner }));
    expect(outcome.result.ok).toBe(true);
    if (outcome.result.ok) {
      expect(outcome.result.value.stdout).toBe("ok");
      expect(outcome.result.value.stderrTail.length).toBeLessThanOrEqual(4096);
    }
  });

  test.skipIf(process.platform !== "linux")("a real child writes 1 MB to stderr and still completes", async () => {
    const spec: ProcessSpec = {
      program: "sh",
      args: ["-c", "head -c 1000000 /dev/zero >&2; echo ok"],
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin" },
      cwd: "/",
      stdin: null,
    };
    const outcome = await run(input({ runner: nodeRunner("linux"), spec, clock: nodeClock, timeoutMs: 20_000 }));
    expect(outcome.result.ok).toBe(true);
    if (outcome.result.ok) {
      expect(outcome.result.value.stdout).toContain("ok");
    }
  });
});

const MIB = 1_048_576;
const STREAM_LIMITS = { maxStdoutBytes: 8 * MIB, maxStderrBytes: 65_536 };
const MAX_STREAM_MS = 10_000;
const MAX_HEAP_GROWTH = 64 * MIB;
const STREAM_TIMEOUT_MS = 100;
const CHUNKS_BEFORE_TIMEOUT = 100;

function heapNow(): number {
  Bun.gc(true);
  return process.memoryUsage().heapUsed;
}

describe("supervise streaming", () => {
  test("50 MiB of lines streams through with a bounded retained tail", async () => {
    const stream = streamRunner({ totalBytes: 50 * MIB, newlines: true });
    const generator = supervise(input({ runner: stream.runner, limits: STREAM_LIMITS }));
    const before = heapNow();
    const started = performance.now();
    let yielded = 0;
    let result: Result<SuperviseDone, RunFailure> | null = null;
    for (;;) {
      const step = await generator.next();
      if (step.done === true) {
        result = step.value;
        break;
      }
      yielded += Buffer.byteLength(step.value);
    }
    const elapsed = performance.now() - started;
    const growth = heapNow() - before;
    expect(result.ok).toBe(true);
    expect(yielded).toBe(50 * MIB);
    if (result.ok) {
      expect(Buffer.byteLength(result.value.stdout)).toBeLessThanOrEqual(8 * MIB);
      expect(result.value.stdout.endsWith(stream.lastLine())).toBe(true);
    }
    expect(elapsed).toBeLessThan(MAX_STREAM_MS);
    expect(growth).toBeLessThan(MAX_HEAP_GROWTH);
  });

  test("a 9 MiB single line fails with output-too-large and stops the child", async () => {
    const stream = streamRunner({ totalBytes: 9 * MIB, newlines: false });
    const outcome = await run(input({ runner: stream.runner, limits: STREAM_LIMITS }));
    expect(outcome.result.ok).toBe(false);
    if (!outcome.result.ok) {
      expect(outcome.result.failure.kind).toBe("output-too-large");
      if (outcome.result.failure.kind === "output-too-large") {
        expect(outcome.result.failure.limitBytes).toBe(8 * MIB);
        expect(outcome.result.failure.actualBytes).toBeGreaterThan(8 * MIB);
      }
    }
    expect(stream.signals).toEqual([Signal.Term]);
  });

  test("a timeout fired mid-stream fails with timeout and sends SIGTERM", async () => {
    const clock = fakeClock(0);
    const stream = streamRunner({ totalBytes: 50 * MIB, newlines: true });
    const generator = supervise(
      input({ runner: stream.runner, limits: STREAM_LIMITS, clock, timeoutMs: STREAM_TIMEOUT_MS }),
    );
    let chunks = 0;
    let result: Result<SuperviseDone, RunFailure> | null = null;
    for (;;) {
      const step = await generator.next();
      if (step.done === true) {
        result = step.value;
        break;
      }
      chunks += 1;
      if (chunks === CHUNKS_BEFORE_TIMEOUT) {
        clock.advance(STREAM_TIMEOUT_MS);
      }
    }
    expect(result).toEqual({
      ok: false,
      failure: { kind: "timeout", message: "the run exceeded its timeout", timeoutMs: STREAM_TIMEOUT_MS },
    });
    expect(stream.signals).toEqual([Signal.Term]);
    expect(chunks * STREAM_CHUNK_BYTES).toBeLessThan(50 * MIB);
  });
});
