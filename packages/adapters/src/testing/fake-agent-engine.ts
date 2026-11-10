import type { AgentTree } from "../agent/constants.ts";
import type { AgentEnd, AgentEngineImpl, AgentEngineRun, AgentRunInput } from "../agent/engine.ts";
import type { AgentEvent, AgentOutput, TurnUsage } from "../agent/types.ts";
import { Engine } from "../core/capability.ts";
import { type RunFailure, UnavailableReason } from "../core/failure.ts";
import type { JsonValue } from "../core/json.ts";
import { fail, ok, type Result } from "../core/result.ts";
import type { SdkPlan } from "../core/run.ts";
import type { SessionId } from "../core/session.ts";
import { FakeAgentText, TerminalKind } from "./agent-constants.ts";

/** One scripted engine run: the events to replay, how it ends, an optional pause before each event and an optional extra wait, after the run was cancelled, before `done` settles, and the state of the child process tree to report. */
export interface FakeAgentScript {
  readonly events: readonly AgentEvent[];
  readonly result?: Result<AgentOutput, RunFailure>;
  readonly delayMs?: number;
  readonly settleDelayMs?: number;
  readonly tree?: AgentTree;
}

/** An agent engine that replays scripts and records every run input it was given. */
export type FakeAgentEngine<I extends string> = AgentEngineImpl<I> & { readonly starts: readonly AgentRunInput[] };

/** Waits for `ms`, or until `signal` aborts; resolves true when the wait ran to its end. */
export function abortablePause(ms: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) {
    return Promise.resolve(false);
  }
  return new Promise<boolean>((resolve) => {
    const onAbort = (): void => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(true);
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

interface Channel<T> {
  push(item: T): void;
  end(): void;
  readonly iterable: AsyncIterable<T>;
}

function channel<T>(): Channel<T> {
  const items: T[] = [];
  let ended = false;
  let wake: () => void = () => {};
  const signalWaiter = (): void => {
    const current = wake;
    wake = () => {};
    current();
  };
  async function* drain(): AsyncGenerator<T> {
    for (;;) {
      const next = items.shift();
      if (next !== undefined) {
        yield next;
        continue;
      }
      if (ended) {
        return;
      }
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    }
  }
  return {
    push(item) {
      items.push(item);
      signalWaiter();
    },
    end() {
      ended = true;
      signalWaiter();
    },
    iterable: drain(),
  };
}

function outputOf(events: readonly AgentEvent[]): AgentOutput {
  let text = "";
  let turns = 0;
  let model: string | null = null;
  let output: JsonValue | null = null;
  let sessionId: SessionId | null = null;
  let checkpoint: string | null = null;
  const usage: TurnUsage[] = [];
  for (const event of events) {
    if (event.kind === "text") {
      text += event.text;
    } else if (event.kind === "turn") {
      turns = event.n;
    } else if (event.kind === "usage") {
      usage.push({ turn: event.turn, model: event.model, input: event.input, cacheWrite: event.cacheWrite, cacheRead: event.cacheRead, output: event.output });
      model = event.model ?? model;
    } else if (event.kind === "session") {
      sessionId = event.id;
      checkpoint = event.checkpoint;
    } else if (event.kind === "output") {
      output = event.value;
    }
  }
  return { text, output, sessionId, checkpoint, turns: Math.max(turns, usage.length), usage, model };
}

function exhaustedFailure(): RunFailure {
  return { kind: "unavailable", message: FakeAgentText.Exhausted, reason: UnavailableReason.InternalError };
}

function cancelledFailure(): RunFailure {
  return { kind: "cancelled", message: FakeAgentText.Cancelled };
}

function endOf(script: FakeAgentScript, emitted: readonly AgentEvent[]): Result<AgentEnd, RunFailure> {
  const result = script.result ?? ok(outputOf(emitted));
  return result.ok ? ok({ output: result.value, stderrTail: "" }) : fail(result.failure);
}

function runOf(script: FakeAgentScript | undefined, input: AgentRunInput): AgentEngineRun {
  const out = channel<AgentEvent>();
  const own = new AbortController();
  const stop = (): void => own.abort();
  input.signal.addEventListener("abort", stop, { once: true });
  if (input.signal.aborted) {
    own.abort();
  }
  const pump = async (): Promise<Result<AgentEnd, RunFailure>> => {
    if (script === undefined) {
      return fail(exhaustedFailure());
    }
    const emitted: AgentEvent[] = [];
    for (const event of script.events) {
      if (event.kind === TerminalKind) {
        continue;
      }
      if (script.delayMs !== undefined && script.delayMs > 0) {
        await abortablePause(script.delayMs, own.signal);
      }
      if (own.signal.aborted) {
        return fail(cancelledFailure());
      }
      emitted.push(event);
      out.push(event);
    }
    if (own.signal.aborted && script.result === undefined) {
      return fail(cancelledFailure());
    }
    return endOf(script, emitted);
  };
  const done = pump().then(async (end) => {
    input.signal.removeEventListener("abort", stop);
    out.end();
    if (own.signal.aborted && script?.settleDelayMs !== undefined && script.settleDelayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, script.settleDelayMs));
    }
    return end;
  });
  return { events: out.iterable, cancel: stop, done, tree: () => script?.tree ?? "gone" };
}

function planOf(harness: string, input: AgentRunInput): SdkPlan {
  return {
    harness,
    engine: Engine.Sdk,
    entry: FakeAgentText.PlanEntry,
    options: {},
    env: { kind: "closed", inject: Object.keys(input.env), strip: [], set: [] },
    cwd: { kind: "given", retain: null },
    confinement: input.confinement,
    notes: [],
  };
}

/** An agent engine for tests with no model and no binary. Each `start` replays the next script; a run past the last script ends with a FAKE-marked unavailable failure. It never emits `finished`. */
export function fakeAgentEngine<I extends string>(harness: I, scripts: readonly FakeAgentScript[]): FakeAgentEngine<I> {
  const starts: AgentRunInput[] = [];
  return {
    harness,
    starts,
    start(input) {
      const script = scripts[starts.length];
      starts.push(input);
      return runOf(script, input);
    },
    describe: (input) => ok(planOf(harness, input)),
  };
}
