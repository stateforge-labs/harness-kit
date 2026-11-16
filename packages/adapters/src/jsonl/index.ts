import { closeSync, openSync, readSync, statSync } from "node:fs";
import { parseJson } from "../core/rows.ts";

export type JsonlRow = Readonly<{ [key: string]: unknown }>;

export interface Tail {
  readonly lines: readonly string[];
  readonly truncated: boolean;
}

export interface JsonlRead {
  readonly lines: readonly string[];
  readonly cursor: number;
  readonly grew: boolean;
}

export type TailReader = (path: string, budgetBytes: number) => Tail;

export interface TailGrowth<Scan> {
  readonly initialBytes: number;
  readonly maxBytes: number;
  readonly scan: (tail: Tail) => Scan;
  readonly wantsMore: (scan: Scan) => boolean;
  readonly read?: TailReader;
}

export interface GrownTail<Scan> {
  readonly scan: Scan;
  readonly tail: Tail;
  readonly bytes: number;
}

export function readLines(path: string, from: number, budgetBytes: number): { readonly lines: readonly string[]; readonly end: number } {
  const fd = openSync(path, "r");
  try {
    const buffer = Buffer.alloc(budgetBytes);
    const read = readSync(fd, buffer, 0, budgetBytes, from);
    const lastNewline = buffer.subarray(0, read).lastIndexOf(0x0a);
    if (lastNewline < 0) {
      return { lines: [], end: from };
    }
    return { lines: buffer.subarray(0, lastNewline).toString("utf8").split("\n"), end: from + lastNewline + 1 };
  } finally {
    closeSync(fd);
  }
}

export function tailOf(path: string, budgetBytes: number): Tail {
  const size = statSync(path).size;
  return { lines: readLines(path, Math.max(0, size - budgetBytes), budgetBytes).lines, truncated: size > budgetBytes };
}

export function tailLines(path: string, budgetBytes: number): readonly string[] {
  return tailOf(path, budgetBytes).lines;
}

export function readJsonl(path: string, cursor: number, budgetBytes: number): JsonlRead {
  const size = statSync(path).size;
  const { lines, end } = readLines(path, Math.max(cursor, size - budgetBytes, 0), budgetBytes);
  return { lines, cursor: end, grew: size > cursor };
}

export function growTail<Scan>(path: string, budgetBytes: number, growth: TailGrowth<Scan>): GrownTail<Scan> {
  const read = growth.read ?? tailOf;
  let bytes = Math.max(budgetBytes, growth.initialBytes);
  let tail = read(path, bytes);
  let scan = growth.scan(tail);
  while (tail.truncated && growth.wantsMore(scan) && bytes < growth.maxBytes) {
    bytes = Math.min(bytes * 2, growth.maxBytes);
    tail = read(path, bytes);
    scan = growth.scan(tail);
  }
  return { scan, tail, bytes };
}

export function parseRow(line: string): JsonlRow | null {
  const value = parseJson(line);
  return typeof value === "object" && value !== null ? (value as JsonlRow) : null;
}

export function rowOf(value: unknown): JsonlRow {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonlRow) : {};
}

export function rowsOf(value: unknown): readonly JsonlRow[] {
  return Array.isArray(value) ? value.map((item) => rowOf(item)) : [];
}

export function textOf(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}
