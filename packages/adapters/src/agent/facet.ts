import type { RunFailure } from "../core/failure.ts";
import { fail, ok, type Result } from "../core/result.ts";
import { type RuntimeContext, nextRunId, track } from "../driver/context.ts";
import { captureThrow, guardSync, settle } from "../driver/execute.ts";
import { abortedFailure, closedFailure, unknownFailure } from "../driver/finish.ts";
import type { Drivers, HarnessDriver } from "../driver/port.ts";
import { lookupDriver } from "../driver/runtime-ops.ts";
import { AbortReason, AgentEventKind, AgentLabel, AgentMessage, RECOVERY_RUN_SUFFIX, SESSION_NOT_FOUND } from "./constants.ts";
import type { AgentEngineImpl, AgentEngineRun, AgentRunInput } from "./engine.ts";
import { channel, drain, internalFailure, merge, newSeen, observe, scrub } from "./fold.ts";
import { type AgentPrepared, checkDirs, checkStart, prepareAgent } from "./prepare.ts";
import { missedSession, recoverable, recoveryStart } from "./recover.ts";
import type { Agent, AgentEvent, AgentOptions, AgentOutput, AgentRun, AgentStart } from "./types.ts";

const noop = (): void => {};

type Outcome = Result<AgentOutput, RunFailure>;

interface Attempt {
  readonly result: Outcome;
  readonly held: readonly AgentEvent[];
  readonly flushed: boolean;
}

function abortFailure(reason: AbortReason, options: AgentOptions): RunFailure {
  if (reason === AbortReason.Cancelled) {
    return { kind: "cancelled", message: AgentMessage.Cancelled };
  }
  if (reason === AbortReason.Timeout) {
    return { kind: "timeout", message: AgentMessage.TimedOut, timeoutMs: options.timeoutMs ?? 0 };
  }
  if (reason === AbortReason.Idle) {
    return { kind: "timeout", message: AgentMessage.IdleTimedOut, timeoutMs: options.idleTimeoutMs ?? 0 };
  }
  return abortedFailure();
}

function launch<I extends string>(ctx: RuntimeContext, prepared: AgentPrepared<I>, start: AgentStart): AgentRun {
  const options = prepared.options;
  const out = channel<AgentEvent>();
  const control = new AbortController();
  let reason: AbortReason | null = null;
  let live: AgentEngineRun | null = null;
  let finished = false;
  let stopIdle: () => void = noop;
  let stopTimeout: () => void = noop;
  const detach: (() => void)[] = [];
  let resolveSettled: (result: Outcome) => void = noop;
  const settled = new Promise<Outcome>((resolve) => {
    resolveSettled = resolve;
  });

  const abort = (why: AbortReason): void => {
    if (finished || reason !== null) {
      return;
    }
    reason = why;
    control.abort();
    const run = live;
    if (run !== null) {
      captureThrow(() => run.cancel());
    }
  };

  const armIdle = (): void => {
    stopIdle();
    const idle = options.idleTimeoutMs;
    stopIdle = idle === undefined || finished ? noop : ctx.clock.after(idle, () => abort(AbortReason.Idle));
  };

  const emit = (event: AgentEvent): void => out.push(scrub(event, prepared.redact));

  const inputOf = (runId: string, current: AgentStart): AgentRunInput => ({
    options,
    start: current,
    env: prepared.env,
    secrets: prepared.secrets,
    confinement: prepared.confinement,
    runId,
    signal: control.signal,
    redact: prepared.redact,
  });

  const attempt = async (input: AgentRunInput, hold: boolean): Promise<Attempt> => {
    const engine: AgentEngineImpl<I> = prepared.engine;
    const started = captureThrow(() => engine.start(input));
    if (!started.ok) {
      return { result: fail(internalFailure()), held: [], flushed: true };
    }
    const run = started.value;
    live = run;
    if (reason !== null) {
      captureThrow(() => run.cancel());
    }
    armIdle();
    const seen = newSeen();
    let held: AgentEvent[] = [];
    let flushed = !hold;
    const onEvent = (event: AgentEvent): void => {
      if (event.kind === "finished") {
        return;
      }
      armIdle();
      observe(seen, event);
      if (!flushed) {
        if (event.kind === "started") {
          held.push(event);
          return;
        }
        flushed = true;
        held.forEach(emit);
        held = [];
      }
      emit(event);
    };
    const drained = await drain(run, onEvent);
    live = null;
    stopIdle();
    const end = drained.end;
    const result: Outcome = drained.threw || end === null ? fail(internalFailure()) : end.ok ? ok(merge(seen, end.value.output)) : fail(end.failure);
    return { result, held, flushed };
  };

  const main = async (): Promise<Outcome> => {
    if (ctx.state.closed) {
      return fail(closedFailure());
    }
    const refused = checkStart(prepared, start);
    if (refused !== null) {
      return fail(refused);
    }
    const dirs = await settle(() => checkDirs(ctx.fs, options));
    if (!dirs.ok) {
      return fail(internalFailure());
    }
    if (dirs.value !== null) {
      return fail(dirs.value);
    }
    if (reason !== null) {
      return fail(abortedFailure());
    }
    const runId = nextRunId(ctx);
    const first = inputOf(runId, start);
    const described = captureThrow(() => prepared.engine.describe(first));
    if (!described.ok) {
      return fail(internalFailure());
    }
    if (!described.value.ok) {
      return fail(described.value.failure);
    }
    const canRecover = recoverable(start);
    const one = await attempt(first, canRecover);
    const again = canRecover && !one.flushed && missedSession(one.result) && reason === null;
    if (!again) {
      one.held.forEach(emit);
      return one.result;
    }
    emit({ kind: AgentEventKind.Recovered, reason: SESSION_NOT_FOUND });
    const two = await attempt(inputOf(`${runId}${RECOVERY_RUN_SUFFIX}`, recoveryStart(start)), false);
    return two.result;
  };

  const finish = (result: Outcome): void => {
    const why = reason;
    const final: Outcome = scrub(why === null ? result : fail(abortFailure(why, options)), prepared.redact);
    finished = true;
    stopIdle();
    stopTimeout();
    detach.forEach((undo) => undo());
    out.push({ kind: "finished", result: final });
    out.close();
    resolveSettled(final);
  };

  const sources = [options.signal, ctx.state.shutdown.signal];
  for (const source of sources) {
    if (source === undefined) {
      continue;
    }
    if (source.aborted) {
      abort(AbortReason.Aborted);
    } else {
      const onAbort = (): void => abort(AbortReason.Aborted);
      source.addEventListener("abort", onAbort, { once: true });
      detach.push(() => source.removeEventListener("abort", onAbort));
    }
  }
  if (options.timeoutMs !== undefined) {
    stopTimeout = ctx.clock.after(options.timeoutMs, () => abort(AbortReason.Timeout));
  }

  const work = settle(main).then((done) => finish(done.ok ? done.value : fail(internalFailure())));
  track(ctx, work);
  const closed = work.then(noop);
  return { events: out.iterable, settled, cancel: () => (abort(AbortReason.Cancelled), closed) };
}

export function agentOf<H extends string>(
  ctx: RuntimeContext,
  drivers: Drivers<H>,
  engines: Readonly<Record<string, AgentEngineImpl<string> | undefined>> | undefined,
  id: string,
  options: AgentOptions,
): Result<Agent, RunFailure> {
  if (ctx.state.closed) {
    return fail(closedFailure());
  }
  const driver = lookupDriver(drivers, id) as unknown as HarnessDriver<string> | null;
  if (driver === null) {
    return fail(unknownFailure(id));
  }
  const injected = engines !== undefined && Object.hasOwn(engines, id) ? engines[id] : undefined;
  const prepared = guardSync(AgentLabel.Facet, () => prepareAgent({ driver, engine: injected ?? driver.run.agent, options, allowedModes: ctx.allowedModes }));
  if (!prepared.ok) {
    return fail(prepared.failure);
  }
  const value = prepared.value;
  return ok({ capabilities: value.capabilities, hooks: value.hooks, start: (start) => launch(ctx, value, start) });
}
