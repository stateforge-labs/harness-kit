import { num, obj, parseRow, str } from "../../core/rows.ts";
import { CostBasis, PromptText } from "../../core/engine-constants.ts";
import { exitFailure } from "../../core/kit.ts";
import { asSessionId } from "../../core/session.ts";
import type { EngineEvent } from "../../driver/port.ts";
import { OpenCodeErrorField, OpenCodeStreamField, OpenCodeStreamType } from "../constants.ts";
import { OpenCodeStreamEventType } from "../enums.ts";

export interface OpencodeRunReading {
  readonly text: string;
  readonly cost: number | null;
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
      readonly error: { readonly message: string } | null;
    };

const SKIP: Classified = { kind: "skip" };

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
    error: type === OpenCodeStreamType.Error ? { message: str(obj(row[OpenCodeStreamField.Error])[OpenCodeErrorField.Message]) ?? PromptText.Empty } : null,
  };
}

export function readOpencodeRun(stdout: string): OpencodeRunReading {
  let text = PromptText.Empty;
  let cost: number | null = null;
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
    error = error ?? read.error;
  }
  return { text, cost, sessionId, error, unknownRows };
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
    events.push({ kind: "cost", cost: { usd: read.cost, basis: CostBasis.List } });
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
