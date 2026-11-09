import { join } from "node:path";
import { Engine } from "../core/capability.ts";
import { EngineMessage } from "../core/engine-constants.ts";
import type { RunFailure } from "../core/failure.ts";
import { budgetOf } from "../core/kit.ts";
import { argvBytes, envBytes } from "../core/limits.ts";
import { fail, ok, type Result } from "../core/result.ts";
import { SpawnPurpose } from "../core/run.ts";
import { EnvField, HandleLabel, OUT_FILE_NAME, PLACEHOLDER_OUT_FILE } from "../driver/constants.ts";
import type { CleanupContext, CliEngine, CliEngineParts, CliRunInput, EngineDescription, EngineEnd, EngineEvent, EngineIo, EngineRun, EngineRunInput } from "../driver/engine.ts";
import { mergeInvocationEnv } from "../driver/env-plan.ts";
import { execute, guardSync, settle } from "../driver/execute.ts";
import { abortedFailure, binaryMissing, helpUnavailable, scratchFailure } from "../driver/finish.ts";
import { lineAssembler } from "../driver/lines.ts";
import type { EngineInput, Invocation } from "../driver/port.ts";
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

function spawned(failure: RunFailure): boolean {
  return failure.kind !== "unavailable" && failure.kind !== "too-large";
}

async function tidy<I extends string>(parts: CliEngineParts<I>, ctx: CleanupContext): Promise<void> {
  const cleanup = parts.cleanup;
  if (cleanup !== undefined) {
    await execute(HandleLabel.Stream, async () => {
      await cleanup(ctx);
      return ok(null);
    });
  }
}

async function readOutFile(input: CliRunInput, io: EngineIo): Promise<string | null> {
  if (input.outFile === null) {
    return null;
  }
  const outFile = input.outFile;
  const read = await settle(() => io.fs.readText(outFile, input.limits.maxStdoutBytes));
  return read.ok ? read.value : null;
}

function describeCli<I extends string>(parts: CliEngineParts<I>, input: EngineInput<I>): Result<EngineDescription, RunFailure> {
  const planned = parts.invocation(input);
  if (!planned.ok) {
    return fail(planned.failure);
  }
  const invocation = planned.value;
  return ok({
    engine: Engine.Cli,
    binary: invocation.program,
    args: invocation.args,
    stdinBytes: invocation.stdin === null ? 0 : new TextEncoder().encode(invocation.stdin).byteLength,
    argvCarries: invocation.argvCarries,
    env: Object.keys(invocation.env ?? {}),
  });
}

function invocationInput<I extends string>(input: EngineRunInput<I>, outFile: string): EngineInput<I> {
  return { options: input.options, credential: input.credential, instructions: input.instructions, input: input.input, outFile, runId: input.runId };
}

async function checkedHelp<I extends string>(parts: CliEngineParts<I>, input: EngineRunInput<I>, path: string): Promise<Result<null, RunFailure>> {
  const helpArgs = parts.helpArgs ?? null;
  if (helpArgs === null) {
    return ok(null);
  }
  const help = await input.host.help(path, helpArgs);
  if (help === null) {
    return fail(helpUnavailable());
  }
  return (parts.checkHelp ?? acceptAll)(help);
}

async function ready<I extends string>(parts: CliEngineParts<I>, input: EngineRunInput<I>): Promise<Result<CliRunInput<I>, RunFailure>> {
  if (input.signal?.aborted === true) {
    return fail(abortedFailure());
  }
  const draft = parts.invocation(invocationInput(input, PLACEHOLDER_OUT_FILE));
  if (!draft.ok) {
    return fail(draft.failure);
  }
  const located = await input.host.locate(draft.value.program);
  if (located === null) {
    return fail(binaryMissing());
  }
  const version = await input.host.version(located);
  if (!version.ok) {
    return fail(version.failure);
  }
  const helped = await checkedHelp(parts, input, located);
  if (!helped.ok) {
    return fail(helped.failure);
  }
  let invocation: Invocation = draft.value;
  let outFile: string | null = null;
  if (invocation.args.includes(PLACEHOLDER_OUT_FILE)) {
    const dir = await input.host.scratch();
    if (dir === null) {
      return fail(scratchFailure());
    }
    outFile = join(dir, OUT_FILE_NAME);
    const real = parts.invocation(invocationInput(input, outFile));
    if (!real.ok) {
      return fail(real.failure);
    }
    invocation = real.value;
  }
  const env = mergeInvocationEnv(input.env, invocation.env, input.injected);
  const budget = budgetOf(input.options, input.profile);
  const total = argvBytes(invocation.args) + envBytes(env);
  if (budget.total !== null && total > budget.total) {
    return fail({ kind: "too-large", message: EngineMessage.EnvTooLarge, limitBytes: budget.total, actualBytes: total, field: EnvField.Environment });
  }
  input.host.emit({ kind: "spawn", harness: input.profile.id, engine: Engine.Cli, purpose: SpawnPurpose.Run, argc: invocation.args.length });
  return ok({ ...input, env, program: located, invocation, outFile, binary: { path: located, version: version.value } });
}

function cliRun<I extends string>(parts: CliEngineParts<I>, original: EngineRunInput<I>, io: EngineIo): EngineRun {
  const cancelled = new AbortController();
  const signal = original.signal === undefined ? cancelled.signal : AbortSignal.any([original.signal, cancelled.signal]);
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
    const prepared = await ready(parts, { ...original, signal });
    if (!prepared.ok) {
      finish(fail(prepared.failure));
      return;
    }
    const input = prepared.value;
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
      yield { kind: "started" };
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
          if (spawned(step.value.failure)) {
            await tidy(parts, { input, io, stdoutTail: "" });
          }
          break;
        }
        const end: EngineEnd = { exit: step.value.value.exit, stderrTail: step.value.value.stderrTail, binary: input.binary };
        const stdoutTail = step.value.value.stdout;
        const after = parts.after;
        if (after !== undefined && !broken) {
          const outFileText = await readOutFile(input, io);
          const ran = await execute(HandleLabel.Stream, async () => ok(await after({ input, end, stdoutTail, outFileText, io })));
          yield* ran.ok ? ran.value : [{ kind: "failure" as const, failure: ran.failure }];
        }
        outcome = ok(end);
        await tidy(parts, { input, io, stdoutTail });
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

/** Builds a CLI engine from its parts: the invocation, the line parser and the optional after, cleanup and help checks. */
export function cliEngine<I extends string>(parts: CliEngineParts<I>): CliEngine<I> {
  return {
    start: (input, io) => cliRun(parts, input, io),
    describe: (input) => describeCli(parts, input),
    invocation: (input) => parts.invocation(input),
    parseLine: (line) => parts.parseLine(line),
    helpArgs: parts.helpArgs ?? null,
    checkHelp: parts.checkHelp ?? acceptAll,
  };
}
