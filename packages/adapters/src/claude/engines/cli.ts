import { CredentialMode } from "../../core/credential-plan.ts";
import { measuredValue } from "../../core/evidence.ts";
import type { RunFailure } from "../../core/failure.ts";
import { asSessionId } from "../../core/session.ts";
import { parseRow, num, obj, str } from "../../core/rows.ts";
import { fail, ok, type Result } from "../../core/result.ts";
import { Hermetic } from "../../core/run.ts";
import { ArgvCarry, CostBasis, EngineReason, PromptText } from "../../core/engine-constants.ts";
import { budgetOf, checkArgv, exitFailure, gatesFor, modelFlag, neutralOrNative, unparsable } from "../../core/kit.ts";
import { cliEngine } from "../../engine/cli.ts";
import type { AfterContext, EngineEvent, EngineInput, Invocation } from "../../driver/port.ts";
import { CLAUDE_CAPABILITIES } from "../capabilities.ts";
import { ClaudeArg, ClaudeCli, ClaudeModelUsageField, ClaudeResultField, ClaudeSettingSources, ClaudeUsageField } from "../constants.ts";
import { CLAUDE_BINARY } from "../launch.ts";
import { CLAUDE_PROFILE } from "../profile.ts";

function claudeArgs(input: EngineInput<"claude">, effort: string | null): string[] {
  const { options, credential, instructions } = input;
  const full = options.hermetic === Hermetic.Full;
  const keepsUserSettings = credential.mode === CredentialMode.LoginStore || credential.mode === CredentialMode.Token;
  return [
    ClaudeCli.Print,
    ...modelFlag(ClaudeCli.Model, options.model),
    ...(options.persist ? [] : [ClaudeCli.NoSessionPersistence]),
    ...(full ? [ClaudeCli.Tools, ClaudeArg.Empty, ClaudeCli.SettingSources, ClaudeArg.Empty, ClaudeCli.StrictMcpConfig] : []),
    ...(!full && keepsUserSettings ? [ClaudeCli.SettingSources, ClaudeSettingSources.NoUser] : []),
    ClaudeCli.OutputFormat,
    ClaudeCli.OutputJson,
    ...(instructions === ClaudeArg.Empty ? [] : [ClaudeCli.SystemPrompt, instructions]),
    ...(effort === null ? [] : [ClaudeCli.Effort, effort]),
  ];
}

function claudeEvents(ctx: AfterContext): readonly EngineEvent[] {
  const row = parseRow(ctx.stdoutTail);
  if (row === null) {
    return [{ kind: "failure", failure: unparsable(EngineReason.NotJson) }];
  }
  if (ctx.end.exit.code !== 0 || row[ClaudeResultField.IsError] === true) {
    return [{ kind: "failure", failure: exitFailure(ctx.end.exit, ctx.end.stderrTail) }];
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
  const session = asSessionId(str(row[ClaudeResultField.SessionId]) ?? PromptText.Empty);
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
    ...(session === null ? [] : [{ kind: "session" as const, id: session }]),
  ];
}

export const claudeCli = cliEngine<"claude">({
  invocation(input): Result<Invocation, RunFailure> {
    const gate = gatesFor(CLAUDE_CAPABILITIES, input.options);
    if (gate !== null) {
      return fail(gate);
    }
    const effort = neutralOrNative(input.options.effort, measuredValue(CLAUDE_PROFILE.effort.accepted));
    if (!effort.ok) {
      return fail(effort.failure);
    }
    const args = claudeArgs(input, effort.value);
    const over = checkArgv(args, budgetOf(input.options, CLAUDE_PROFILE));
    if (over !== null) {
      return fail(over);
    }
    const invocation: Invocation = {
      program: CLAUDE_BINARY,
      args,
      stdin: input.input,
      outFile: null,
      argvCarries: [ArgvCarry.Instructions],
    };
    return ok(invocation);
  },

  parseLine: () => [],

  after: (ctx) => Promise.resolve(claudeEvents(ctx)),
});
