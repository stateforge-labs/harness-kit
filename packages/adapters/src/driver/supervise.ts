import { TextDecoder } from "node:util";
import type { RunFailure } from "../core/failure.ts";
import type { Clock } from "../core/io.ts";
import { tailBytes } from "../core/limits.ts";
import type { Limits } from "../core/run.ts";
import { fail, ok, type Result } from "../core/result.ts";
import { Decode, DrainStep, FAILURE_TAIL_BYTES, StopReason, SuperviseMessage } from "./constants.ts";
import type { ProcessExit } from "./port.ts";
import type { ProcessRunner, ProcessSpec, RunningProcess } from "./ports.ts";
import { rollingText } from "./rolling-text.ts";
import { exitFailure, isFailedExit, spawnFailure, stopFailure } from "./supervise-failure.ts";
import { lifecycle, type Lifecycle } from "./supervise-lifecycle.ts";

export interface SuperviseInput {
  readonly runner: ProcessRunner;
  readonly spec: ProcessSpec;
  readonly signal: AbortSignal | undefined;
  readonly timeoutMs: number | undefined;
  readonly limits: Limits;
  readonly clock: Clock;
  readonly redact: (text: string) => string;
}

export interface SuperviseDone {
  readonly stdout: string;
  readonly stderrTail: string;
  readonly exit: ProcessExit;
}

type Supervised = AsyncGenerator<string, Result<SuperviseDone, RunFailure>, undefined>;

export async function* supervise(input: SuperviseInput): Supervised {
  if (input.signal?.aborted === true) {
    return fail({ kind: "aborted", message: SuperviseMessage.Aborted });
  }
  const spawned = await input.runner(input.spec);
  if (!spawned.ok) {
    return fail(spawnFailure(spawned.failure, input.spec));
  }
  const life = lifecycle({
    running: spawned.value,
    clock: input.clock,
    signal: input.signal,
    timeoutMs: input.timeoutMs,
  });
  try {
    return yield* pump(input, spawned.value, life);
  } finally {
    await life.finish();
  }
}

async function* pump(input: SuperviseInput, running: RunningProcess, life: Lifecycle): Supervised {
  const stderr = rollingText(input.limits.maxStderrBytes, input.redact);
  const errDecoder = new TextDecoder();
  const stderrDone = (async () => {
    for await (const chunk of running.stderr) {
      stderr.append(errDecoder.decode(chunk, Decode.Streaming));
    }
    stderr.append(errDecoder.decode());
  })();

  const outDecoder = new TextDecoder();
  const iterator = running.stdout[Symbol.asyncIterator]();
  let stdoutBytes = 0;
  let stdoutText = "";
  for (;;) {
    const step = await Promise.race([iterator.next(), life.expired]);
    if (step === DrainStep.Expired || step.done === true) {
      break;
    }
    stdoutBytes += step.value.byteLength;
    if (stdoutBytes > input.limits.maxStdoutBytes) {
      life.stop({ kind: StopReason.OutputTooLarge });
      continue;
    }
    const text = outDecoder.decode(step.value, Decode.Streaming);
    if (text !== "") {
      stdoutText += text;
      yield text;
    }
  }
  if (life.stopped() === null) {
    const rest = outDecoder.decode();
    if (rest !== "") {
      stdoutText += rest;
      yield rest;
    }
  }

  await Promise.race([stderrDone, life.expired]);
  const exit = await life.exited;
  const stderrTail = tailBytes(stderr.read(), FAILURE_TAIL_BYTES);

  const stop = life.stopped();
  if (stop !== null) {
    return fail(stopFailure(stop, stdoutBytes, input.limits));
  }
  if (isFailedExit(exit)) {
    return fail(exitFailure(exit, stderrTail));
  }
  return ok({ stdout: stdoutText, stderrTail, exit });
}
