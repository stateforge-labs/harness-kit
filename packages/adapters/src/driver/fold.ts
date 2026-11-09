import { EngineReason, FAILURE_TAIL_BYTES, PromptText, CostBasis } from "../core/engine-constants.ts";
import type { RunFailure } from "../core/failure.ts";
import { exitFailure, NO_USAGE, unparsable } from "../core/kit.ts";
import { tailBytes } from "../core/limits.ts";
import { fail, ok, type Result } from "../core/result.ts";
import type { Cost, TokenUsage } from "../core/run.ts";
import type { SessionId } from "../core/session.ts";
import { ExitCode } from "./constants.ts";
import type { EngineEnd, EngineEvent } from "./engine.ts";
import type { ParsedRun } from "./port.ts";

export interface Fold {
  readonly text: string;
  readonly streamed: boolean;
  readonly spawned: boolean;
  readonly final: string | null;
  readonly usage: TokenUsage;
  readonly cost: Cost;
  readonly model: string | null;
  readonly sessionId: SessionId | null;
  readonly unrecognised: readonly unknown[];
  readonly failure: RunFailure | null;
}

export function foldStart(): Fold {
  return {
    text: PromptText.Empty,
    streamed: false,
    spawned: false,
    final: null,
    usage: NO_USAGE,
    cost: { usd: null, basis: CostBasis.Unreported },
    model: null,
    sessionId: null,
    unrecognised: [],
    failure: null,
  };
}

function summed(before: Cost, next: Cost): Cost {
  return next.usd === null ? next : { usd: (before.usd ?? 0) + next.usd, basis: next.basis };
}

export function foldStep(f: Fold, e: EngineEvent): Fold {
  switch (e.kind) {
    case "started":
      return { ...f, spawned: true };
    case "text":
      return { ...f, text: f.text + e.text, streamed: true };
    case "unrecognised":
      return { ...f, unrecognised: [...f.unrecognised, e.payload] };
    case "final":
      return { ...f, final: e.text };
    case "usage":
      return { ...f, usage: e.usage };
    case "cost":
      return { ...f, cost: summed(f.cost, e.cost) };
    case "model":
      return { ...f, model: e.model };
    case "session":
      return { ...f, sessionId: e.id };
    case "failure":
      return f.failure === null ? { ...f, failure: e.failure } : f;
  }
}

function withExit(failure: RunFailure, end: EngineEnd): RunFailure {
  if (failure.kind === "exit" && failure.code === null && failure.signal === null) {
    const stderrTail = failure.stderrTail === PromptText.Empty ? tailBytes(end.stderrTail, FAILURE_TAIL_BYTES) : failure.stderrTail;
    return { ...failure, code: end.exit.code, signal: end.exit.signal, stderrTail };
  }
  return failure;
}

export function foldEnd(f: Fold, end: EngineEnd, requestedModel: string | null): Result<ParsedRun, RunFailure> {
  if (f.failure !== null) {
    return fail(withExit(f.failure, end));
  }
  if (end.exit.code !== ExitCode.Success || end.exit.signal !== null) {
    return fail(exitFailure(end.exit, end.stderrTail));
  }
  const text = f.final ?? f.text;
  if (text === PromptText.Empty) {
    return fail(unparsable(EngineReason.EmptyText));
  }
  return ok({
    text,
    usage: f.usage,
    cost: f.cost,
    model: f.model ?? requestedModel,
    sessionId: f.sessionId,
    unrecognised: f.unrecognised,
  });
}
