import { fail, ok, type Result } from "../core/result.ts";
import type { RunFailure } from "../core/failure.ts";
import { HandleLabel } from "../driver/constants.ts";
import type { AfterContext, CliEngineParts, EngineEnd, EngineEvent, EngineImpl, EngineIo, EngineRun, EngineRunInput } from "../driver/engine.ts";
import { execute, guardSync, settle } from "../driver/execute.ts";
import { abortedFailure } from "../driver/finish.ts";
import { lineAssembler } from "../driver/lines.ts";
import { supervise } from "../driver/supervise.ts";

type Settled = Result<EngineEnd, RunFailure>;

function acceptAll(): Result<null, RunFailure> {
  return ok(null);
}

interface Parsed {
  readonly events: readonly EngineEvent[];
  readonly threw: boolean;
}

function parsed(parts: { parseLine(line: string): readonly EngineEvent[] }, line: string): Parsed {
  const outcome = guardSync(HandleLabel.Stream, () => ok(parts.parseLine(line)));
  return outcome.ok ? { events: outcome.value, threw: false } : { events: [{ kind: "failure", failure: outcome.failure }], threw: true };
}

async function readOutFile(input: EngineRunInput, io: EngineIo): Promise<string | null> {
  if (input.outFile === null) {
    return null;
  }
  const outFile = input.outFile;
  const read = await settle(() => io.fs.readText(outFile, input.limits.maxStdoutBytes));
  return read.ok ? read.value : null;
}

function cliRun<I extends string>(parts: CliEngineParts<I>, input: EngineRunInput, io: EngineIo): EngineRun {
  const cancelled = new AbortController();
  const signal = input.signal === undefined ? cancelled.signal : AbortSignal.any([input.signal, cancelled.signal]);
  let resolveDone: (result: Settled) => void = () => {};
  const done = new Promise<Settled>((resolve) => {
    resolveDone = resolve;
  });
  let begun = false;
  let settled = false;
  const finish = (result: Settled): void => {
    if (!settled) {
      settled = true;
      resolveDone(result);
    }
  };

  async function* events(): AsyncGenerator<EngineEvent, void, undefined> {
    begun = true;
    const lines = lineAssembler();
    const supervised = supervise({
      runner: io.runner,
      spec: { program: input.program, args: input.invocation.args, env: input.env, cwd: input.cwd, stdin: input.invocation.stdin },
      signal,
      timeoutMs: input.timeoutMs,
      limits: input.limits,
      clock: io.clock,
      redact: input.redact,
    });
    let finished = false;
    let broken = false;
    let outcome: Settled = fail(abortedFailure());
    try {
      for (;;) {
        const step = await supervised.next();
        const batch = step.done === true ? lines.flush() : lines.push(step.value);
        for (const line of batch) {
          if (broken) {
            continue;
          }
          const read = parsed(parts, input.redact(line));
          broken = read.threw;
          yield* read.events;
        }
        if (step.done !== true) {
          continue;
        }
        finished = true;
        if (!step.value.ok) {
          outcome = fail(step.value.failure);
          break;
        }
        const end: EngineEnd = { exit: step.value.value.exit, stderrTail: step.value.value.stderrTail };
        const stdoutTail = step.value.value.stdout;
        const after = parts.after;
        if (after !== undefined && !broken) {
          const outFileText = await readOutFile(input, io);
          const ran = await execute(HandleLabel.Stream, async () => ok(await after({ input, end, stdoutTail, outFileText, io })));
          yield* ran.ok ? ran.value : [{ kind: "failure" as const, failure: ran.failure }];
        }
        outcome = ok(end);
        break;
      }
    } finally {
      if (!finished) {
        await supervised.return(fail(abortedFailure()));
      }
      finish(outcome);
    }
  }

  return {
    events: events(),
    cancel() {
      cancelled.abort();
      if (!begun) {
        finish(fail(abortedFailure()));
      }
    },
    done,
  };
}

export function cliEngine<I extends string>(parts: CliEngineParts<I>): EngineImpl<I> {
  return {
    invocation: (input) => parts.invocation(input),
    start: (input, io) => cliRun(parts, input, io),
    parseLine: (line) => parts.parseLine(line),
    helpArgs: parts.helpArgs ?? null,
    checkHelp: parts.checkHelp ?? acceptAll,
  };
}
