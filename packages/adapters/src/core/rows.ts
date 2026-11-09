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
