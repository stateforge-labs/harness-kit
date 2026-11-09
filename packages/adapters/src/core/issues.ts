import type { HarnessId } from "@stateforge-labs/harness-hooks";
import type { z } from "zod";
import { Unknown } from "../constants.ts";
import type { Row } from "./rows.ts";

export interface Issue {
  readonly harness: HarnessId;
  readonly record: string;
  readonly path: string;
  readonly got: unknown;
  readonly expected: string;
}

export type Parsed<T> =
  | { readonly ok: true; readonly record: T; readonly issues: readonly Issue[] }
  | { readonly ok: false; readonly reason: "not-json" | "unknown-type"; readonly type: string | null; readonly row: Row | null };

export interface Unknowns {
  readonly byType: ReadonlyMap<string, number>;
}

export interface Site {
  readonly harness: HarnessId;
  readonly record: string;
  readonly path: string;
}

export function tallyUnknown(parsed: readonly Parsed<unknown>[]): Unknowns {
  const byType = new Map<string, number>();
  for (const entry of parsed) {
    if (entry.ok) {
      continue;
    }
    const key = entry.reason === "not-json" ? Unknown.NotJson : (entry.type ?? Unknown.Untyped);
    byType.set(key, (byType.get(key) ?? 0) + 1);
  }
  return { byType };
}

export function observeEnum<S extends string>(
  schema: z.ZodEnum<Record<S, S>>,
  value: unknown,
  at: Site,
  issues: Issue[],
): S | null {
  if (value === undefined || value === null) {
    return null;
  }
  const result = schema.safeParse(value);
  if (result.success) {
    return result.data;
  }
  issues.push({ harness: at.harness, record: at.record, path: at.path, got: value, expected: schema.options.join("|") });
  return null;
}
