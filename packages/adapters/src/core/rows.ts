import type { JsonValue } from "./json.ts";

export type Row = Readonly<Record<string, unknown>>;

const isRow = (value: unknown): value is Row => typeof value === "object" && value !== null && !Array.isArray(value);

export function parseRow(line: string): Row | null {
  const text = line.trim();
  if (text === "") {
    return null;
  }
  try {
    const value: unknown = JSON.parse(text);
    return isRow(value) ? value : null;
  } catch {
    return null;
  }
}

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export function obj(value: unknown): Row {
  return isRow(value) ? value : {};
}

export function arr(value: unknown): readonly Row[] {
  return Array.isArray(value) ? value.filter(isRow) : [];
}

export function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Narrows an unknown value to JsonValue by checking its shape, without a cast. */
export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  if (typeof value === "object") {
    return Object.values(value).every(isJsonValue);
  }
  return false;
}

export function count(value: unknown): number {
  const n = num(value);
  return n !== null && n >= 0 ? n : 0;
}

export function stamp(value: unknown): number | null {
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
  }
  return num(value);
}
