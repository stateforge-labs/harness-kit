import { CostBasis, EngineReason, PromptText } from "../../core/engine-constants.ts";
import { exitFailure, unparsable } from "../../core/kit.ts";
import { arr, num, obj, parseRow, str, type Row } from "../../core/rows.ts";
import { asSessionId } from "../../core/session.ts";
import type { EngineEvent, ProcessExit } from "../../driver/port.ts";
import { ClaudeBlockType, ClaudeModelUsageField, ClaudeResultField, ClaudeRowField, ClaudeRowType, ClaudeUsageField } from "../constants.ts";

const NO_EXIT: ProcessExit = { code: null, signal: null };
const IGNORED: ReadonlySet<string> = new Set([ClaudeRowType.System, ClaudeRowType.User, ClaudeRowType.RateLimit]);

function sessionEvents(row: Row): readonly EngineEvent[] {
  const id = asSessionId(str(row[ClaudeResultField.SessionId]) ?? PromptText.Empty);
  return id === null ? [] : [{ kind: "session", id }];
}

function assistantEvents(row: Row): readonly EngineEvent[] {
  const blocks = arr(obj(row[ClaudeRowField.Message])[ClaudeRowField.Content]);
  const texts: EngineEvent[] = [];
  for (const block of blocks) {
    const text = str(block[ClaudeRowField.Text]);
    if (block[ClaudeRowField.Type] === ClaudeBlockType.Text && text !== null && text !== PromptText.Empty) {
      texts.push({ kind: "text", text });
    }
  }
  return [...texts, ...sessionEvents(row)];
}

function resultEvents(row: Row): readonly EngineEvent[] {
  if (row[ClaudeResultField.IsError] === true) {
    return [{ kind: "failure", failure: exitFailure(NO_EXIT, PromptText.Empty) }];
  }
  const text = str(row[ClaudeResultField.Result]);
  if (text === null) {
    return [{ kind: "failure", failure: unparsable(EngineReason.NoResult) }];
  }
  const modelUsage = obj(row[ClaudeResultField.ModelUsage]);
  const [firstModel] = Object.keys(modelUsage);
  const basis = firstModel === undefined ? null : obj(modelUsage[firstModel])[ClaudeModelUsageField.CostBasis];
  const usage = obj(row[ClaudeResultField.Usage]);
  const details = obj(usage[ClaudeUsageField.Details]);
  return [
    { kind: "final", text },
    {
      kind: "usage",
      usage: {
        inputTokens: num(usage[ClaudeUsageField.Input]),
        outputTokens: num(usage[ClaudeUsageField.Output]),
        cacheReadTokens: num(usage[ClaudeUsageField.CacheRead]),
        cacheWriteTokens: num(usage[ClaudeUsageField.CacheWrite]),
        reasoningTokens: num(details[ClaudeUsageField.Thinking]),
        totalTokens: null,
      },
    },
    { kind: "cost", cost: { usd: num(row[ClaudeResultField.TotalCostUsd]), basis: basis === CostBasis.List ? CostBasis.List : CostBasis.Unreported } },
    ...(firstModel === undefined ? [] : [{ kind: "model" as const, model: firstModel }]),
    ...sessionEvents(row),
  ];
}

export function claudeLineEvents(line: string): readonly EngineEvent[] {
  if (line.trim() === PromptText.Empty) {
    return [];
  }
  const row = parseRow(line);
  if (row === null) {
    return [{ kind: "unrecognised", payload: line }];
  }
  const type = str(row[ClaudeRowField.Type]);
  if (type === ClaudeRowType.Assistant) {
    return assistantEvents(row);
  }
  if (type === ClaudeRowType.Result) {
    return resultEvents(row);
  }
  if (type !== null && IGNORED.has(type)) {
    return [];
  }
  return [{ kind: "unrecognised", payload: row }];
}
