import { arr, obj, parseRow, str, type Row } from "../core/rows.ts";
import { CodexEvent, CodexField, CodexItem, CodexMarker, CodexToolName } from "./constants.ts";
import type { CodexRow } from "./rollout.ts";

export interface OpenWork {
  readonly turnStartedAt: number | null;
  readonly openCallIds: readonly string[];
  readonly runningCells: readonly string[];
}

interface Flight {
  readonly calls: Set<string>;
  readonly waits: Map<string, string>;
  readonly cells: Map<string, boolean>;
}

const RUNNING_CELL = new RegExp(`${CodexMarker.ScriptRunning} ([A-Za-z0-9_-]+)`);

function cellOf(text: string): string | null {
  return RUNNING_CELL.exec(text)?.[1] ?? null;
}

const CALL_TYPES: ReadonlySet<string> = new Set([CodexItem.CustomToolCall, CodexItem.FunctionCall]);
const OUTPUT_TYPES: ReadonlySet<string> = new Set([CodexItem.CustomToolCallOutput, CodexItem.FunctionCallOutput]);

function outputTexts(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  return arr(value).flatMap((part) => (part[CodexField.Type] === CodexMarker.InputText ? [str(part[CodexField.Text]) ?? ""] : []));
}

function waitCell(payload: Row): string | null {
  if (payload[CodexField.Name] !== CodexToolName.Wait) {
    return null;
  }
  const raw = payload[CodexField.Arguments] ?? payload[CodexField.Input];
  const input = typeof raw === "string" ? (parseRow(raw) ?? {}) : obj(raw);
  return str(input[CodexField.CellId]);
}

function recordCall(payload: Row, flight: Flight): void {
  const id = str(payload[CodexField.CallId]);
  if (id === null) {
    return;
  }
  flight.calls.add(id);
  const cell = waitCell(payload);
  if (cell !== null) {
    flight.waits.set(id, cell);
  }
}

function recordOutput(payload: Row, flight: Flight): void {
  const id = str(payload[CodexField.CallId]);
  if (id === null) {
    return;
  }
  flight.calls.delete(id);
  const texts = outputTexts(payload[CodexField.Output]);
  if (payload[CodexField.Type] === CodexItem.CustomToolCallOutput) {
    for (const text of texts) {
      const cell = cellOf(text);
      if (cell !== null) {
        flight.cells.set(cell, true);
      }
    }
    return;
  }
  const cell = flight.waits.get(id);
  if (cell !== undefined) {
    flight.cells.set(cell, !texts.some((text) => text.includes(CodexMarker.ScriptCompleted)));
  }
}

function lastTaskStart(rows: readonly CodexRow[]): number {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (row?.kind === "event_msg" && row.event === CodexEvent.TaskStarted) {
      return index;
    }
  }
  return -1;
}

export function openWork(rows: readonly CodexRow[]): OpenWork {
  const start = lastTaskStart(rows);
  const flight: Flight = { calls: new Set(), waits: new Map(), cells: new Map() };
  for (const row of rows.slice(start + 1)) {
    if (row.kind !== "response_item") {
      continue;
    }
    const type = row.item ?? "";
    if (CALL_TYPES.has(type)) {
      recordCall(row.payload, flight);
    } else if (OUTPUT_TYPES.has(type)) {
      recordOutput(row.payload, flight);
    }
  }
  return {
    turnStartedAt: rows[start]?.at ?? null,
    openCallIds: [...flight.calls],
    runningCells: [...flight.cells].filter(([, running]) => running).map(([cell]) => cell),
  };
}
