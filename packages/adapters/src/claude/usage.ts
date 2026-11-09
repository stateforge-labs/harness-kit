import { count, type Row } from "../core/rows.ts";
import { ClaudeModel } from "./constants.ts";
import type { ClaudeRecord } from "./records.ts";

export interface ClaudeContextUse {
  readonly tokens: number;
  readonly peakTokens: number;
  readonly model: string | null;
}

const inputOf = (usage: Row): number => count(usage["input_tokens"]) + count(usage["cache_read_input_tokens"]) + count(usage["cache_creation_input_tokens"]);

export function claudeContextUse(records: readonly ClaudeRecord[]): ClaudeContextUse | null {
  let tokens: number | null = null;
  let model: string | null = null;
  let peak = 0;
  for (const record of records) {
    if (record.kind === "system" && record.compact !== null) {
      peak = Math.max(peak, record.compact.preTokens ?? 0);
      const post = record.compact.postTokens ?? 0;
      if (post > 0) {
        tokens = post;
      }
    } else if (record.kind === "assistant" && !record.sidechain && record.model !== ClaudeModel.Synthetic && Object.keys(record.usage).length > 0) {
      tokens = inputOf(record.usage);
      model = record.model;
      peak = Math.max(peak, tokens);
    }
  }
  return tokens === null ? null : { tokens, peakTokens: Math.max(peak, tokens), model };
}
