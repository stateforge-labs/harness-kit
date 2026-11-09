import { num, obj } from "../core/rows.ts";
import { CodexEvent, CodexField } from "./constants.ts";
import type { CodexEventRow, CodexRow } from "./rollout.ts";

export interface TokenCount {
  readonly last: number | null;
  readonly total: number | null;
  readonly window: number | null;
  readonly at: number | null;
}

export interface ContextUsage {
  readonly model: string | null;
  readonly lastTokens: number | null;
  readonly totalTokens: number | null;
  readonly window: number | null;
}

const positive = (value: number | null): number | null => (value !== null && value > 0 ? value : null);

const isTokenCount = (row: CodexRow): row is CodexEventRow => row.kind === "event_msg" && row.event === CodexEvent.TokenCount;

function countOf(row: CodexEventRow): TokenCount {
  const info = obj(row.payload[CodexField.Info]);
  return {
    last: num(obj(info[CodexField.LastTokenUsage])[CodexField.TotalTokens]),
    total: num(obj(info[CodexField.TotalTokenUsage])[CodexField.TotalTokens]),
    window: num(info[CodexField.ModelContextWindow]),
    at: row.at,
  };
}

export function tokenCounts(rows: readonly CodexRow[]): TokenCount[] {
  return rows.filter(isTokenCount).map(countOf);
}

export function contextUsage(rows: readonly CodexRow[]): ContextUsage | null {
  let model: string | null = null;
  let counted: ContextUsage | null = null;
  for (const row of rows) {
    if (row.kind === "turn_context") {
      model = row.model ?? model;
    } else if (isTokenCount(row)) {
      const count = countOf(row);
      if (positive(count.last) !== null || positive(count.total) !== null) {
        counted = { model, lastTokens: count.last, totalTokens: count.total, window: positive(count.window) };
      }
    }
  }
  return counted === null ? null : { ...counted, model };
}
