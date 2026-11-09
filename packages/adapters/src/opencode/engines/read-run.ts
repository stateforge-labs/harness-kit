import { num, obj, parseRow, str, type Row } from "../../core/rows.ts";
import { CostBasis, PromptText } from "../../core/engine-constants.ts";
import { exitFailure } from "../../core/kit.ts";
import type { TokenUsage } from "../../core/run.ts";
import { asSessionId } from "../../core/session.ts";
import { runOnce } from "../../engine/run-once.ts";
import type { AfterContext, EngineEvent } from "../../driver/port.ts";
import { OpenCodeErrorField, OpenCodeExport, OpenCodeStreamField, OpenCodeStreamType } from "../constants.ts";
import { opencodeSessionExportArgs, parseSessionModel } from "../launch.ts";
import { OpenCodeStreamEventType } from "../enums.ts";

export interface OpencodeRunReading {
  readonly text: string;
  readonly cost: number | null;
  readonly usage: TokenUsage | null;
  readonly sessionId: string | null;
  readonly error: { readonly message: string } | null;
  readonly unknownRows: readonly unknown[];
}

type Classified =
  | { readonly kind: "skip" }
  | { readonly kind: "unknown"; readonly row: unknown }
  | {
      readonly kind: "known";
      readonly sessionId: string | null;
      readonly text: string | null;
      readonly cost: number | null;
      readonly usage: TokenUsage | null;
      readonly error: { readonly message: string } | null;
    };

const SKIP: Classified = { kind: "skip" };

function tokenUsage(part: Row): TokenUsage | null {
  const tokens = part[OpenCodeStreamField.Tokens];
  if (typeof tokens !== "object" || tokens === null) {
    return null;
  }
  const row = obj(tokens);
  const cache = obj(row[OpenCodeStreamField.Cache]);
  return {
    inputTokens: num(row[OpenCodeStreamField.Input]),
    outputTokens: num(row[OpenCodeStreamField.Output]),
    cacheReadTokens: num(cache[OpenCodeStreamField.Read]),
    cacheWriteTokens: num(cache[OpenCodeStreamField.Write]),
    reasoningTokens: num(row[OpenCodeStreamField.Reasoning]),
    totalTokens: null,
  };
}

function added(before: number | null, next: number | null): number | null {
  return next === null ? before : (before ?? 0) + next;
}

function addUsage(before: TokenUsage | null, next: TokenUsage): TokenUsage {
  if (before === null) {
    return next;
  }
  return {
    inputTokens: added(before.inputTokens, next.inputTokens),
    outputTokens: added(before.outputTokens, next.outputTokens),
    cacheReadTokens: added(before.cacheReadTokens, next.cacheReadTokens),
    cacheWriteTokens: added(before.cacheWriteTokens, next.cacheWriteTokens),
    reasoningTokens: added(before.reasoningTokens, next.reasoningTokens),
    totalTokens: null,
  };
}

function classify(line: string): Classified {
  const row = parseRow(line);
  if (row === null) {
    return SKIP;
  }
  const type = str(row[OpenCodeStreamField.Type]);
  if (type === null || !OpenCodeStreamEventType.safeParse(type).success) {
    return { kind: "unknown", row };
  }
  const part = obj(row[OpenCodeStreamField.Part]);
  const partCost = num(part[OpenCodeStreamField.Cost]);
  return {
    kind: "known",
    sessionId: str(row[OpenCodeStreamField.SessionId]),
    text: type === OpenCodeStreamType.Text ? str(part[OpenCodeStreamField.Text]) : null,
    cost: type === OpenCodeStreamType.StepFinish ? partCost : null,
    usage: type === OpenCodeStreamType.StepFinish ? tokenUsage(part) : null,
    error: type === OpenCodeStreamType.Error ? { message: str(obj(row[OpenCodeStreamField.Error])[OpenCodeErrorField.Message]) ?? PromptText.Empty } : null,
  };
}

export function readOpencodeRun(stdout: string): OpencodeRunReading {
  let text = PromptText.Empty;
  let cost: number | null = null;
  let usage: TokenUsage | null = null;
  let sessionId: string | null = null;
  let error: { readonly message: string } | null = null;
  const unknownRows: unknown[] = [];
  for (const line of stdout.split(PromptText.Line)) {
    const read = classify(line);
    if (read.kind === "unknown") {
      unknownRows.push(read.row);
    }
    if (read.kind !== "known") {
      continue;
    }
    sessionId = read.sessionId ?? sessionId;
    text += read.text ?? PromptText.Empty;
    cost = read.cost === null ? cost : (cost ?? 0) + read.cost;
    usage = read.usage === null ? usage : addUsage(usage, read.usage);
    error = error ?? read.error;
  }
  return { text, cost, usage, sessionId, error, unknownRows };
}

export function opencodeLineEvents(line: string): readonly EngineEvent[] {
  const read = classify(line);
  if (read.kind === "skip") {
    return [];
  }
  if (read.kind === "unknown") {
    return [{ kind: "unrecognised", payload: read.row }];
  }
  const events: EngineEvent[] = [];
  const session = read.sessionId === null ? null : asSessionId(read.sessionId);
  if (session !== null) {
    events.push({ kind: "session", id: session });
  }
  if (read.text !== null) {
    events.push({ kind: "text", text: read.text });
  }
  if (read.cost !== null) {
    events.push({ kind: "cost", cost: { usd: read.cost, basis: CostBasis.Unreported } });
  }
  if (read.error !== null) {
    events.push({ kind: "failure", failure: exitFailure({ code: null, signal: null }, read.error.message) });
  }
  return events;
}

export function opencodeTextOf(line: string): string | null {
  const row = parseRow(line);
  if (row === null || row[OpenCodeStreamField.Type] !== OpenCodeStreamType.Text) {
    return null;
  }
  return str(obj(row[OpenCodeStreamField.Part])[OpenCodeStreamField.Text]);
}

export async function opencodeAfterEvents(ctx: AfterContext): Promise<readonly EngineEvent[]> {
  const read = readOpencodeRun(ctx.stdoutTail);
  const events: EngineEvent[] = [];
  if (read.usage !== null) {
    events.push({ kind: "usage", usage: read.usage });
  }
  if (read.sessionId === null || read.error !== null || ctx.end.exit.code !== 0) {
    return events;
  }
  const exported = await runOnce(ctx.input, ctx.io, opencodeSessionExportArgs(read.sessionId), OpenCodeExport.CommandTimeoutMs);
  const model = exported === null ? null : parseSessionModel(exported);
  if (model !== null) {
    events.push({ kind: "model", model });
  }
  return events;
}
