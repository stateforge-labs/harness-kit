import { num, parseRow, str } from "../core/rows.ts";
import { EnvVar } from "../env.ts";
import { ClaudeCli, ClaudeResultField } from "./constants.ts";

export const CLAUDE_BINARY = ClaudeCli.Binary;

export const CLAUDE_NESTED_ENV: readonly string[] = [EnvVar.ClaudeCode, EnvVar.ClaudeCodeEntrypoint];

export interface ClaudeHeadlessOptions {
  readonly model: string;
  readonly systemPrompt: string;
  readonly effort?: string | null;
}

export interface ClaudeHeadlessResult {
  readonly text: string;
  readonly costUsd: number;
}

export function claudeHeadlessArgs(opts: ClaudeHeadlessOptions): string[] {
  return [
    ClaudeCli.Print,
    ClaudeCli.Model,
    opts.model,
    ClaudeCli.NoSessionPersistence,
    ClaudeCli.Tools,
    "",
    ClaudeCli.SettingSources,
    "",
    ClaudeCli.StrictMcpConfig,
    ClaudeCli.OutputFormat,
    ClaudeCli.OutputJson,
    ClaudeCli.SystemPrompt,
    opts.systemPrompt,
    ...(opts.effort ? [ClaudeCli.Effort, opts.effort] : []),
  ];
}

export function parseClaudeResult(stdout: string): ClaudeHeadlessResult | null {
  const row = parseRow(stdout);
  if (row === null) {
    return null;
  }
  const text = str(row[ClaudeResultField.Result]);
  if (text === null) {
    return null;
  }
  return { text, costUsd: num(row[ClaudeResultField.TotalCostUsd]) ?? 0 };
}
