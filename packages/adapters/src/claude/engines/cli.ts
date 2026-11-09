import { CredentialMode } from "../../core/credential-plan.ts";
import { measuredValue } from "../../core/evidence.ts";
import type { RunFailure } from "../../core/failure.ts";
import { asSessionId } from "../../core/session.ts";
import { parseRow, num, obj, str } from "../../core/rows.ts";
import { fail, ok, type Result } from "../../core/result.ts";
import { Hermetic } from "../../core/run.ts";
import { ArgvCarry, CostBasis, EngineReason, PromptText } from "../../core/engine-constants.ts";
import { budgetOf, checkArgv, exitFailure, gatesFor, modelFlag, neutralOrNative, unparsable } from "../../core/kit.ts";
import type { CliEngine, EngineInput, Invocation, ParsedRun, RawRun } from "../../driver/port.ts";
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

export const claudeCli: CliEngine<"claude"> = {
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

  interpret(raw: RawRun): Result<ParsedRun, RunFailure> {
    const row = parseRow(raw.stdout);
    if (row === null) {
      return fail(unparsable(EngineReason.NotJson));
    }
    if (raw.exit.code !== 0 || row[ClaudeResultField.IsError] === true) {
      return fail(exitFailure(raw, raw.stderrTail));
    }
    const text = str(row[ClaudeResultField.Result]);
    if (text === null) {
      return fail(unparsable(EngineReason.NoResult));
    }
    const modelUsage = obj(row[ClaudeResultField.ModelUsage]);
    const [firstModel] = Object.keys(modelUsage);
    const basis = firstModel === undefined ? null : obj(modelUsage[firstModel])[ClaudeModelUsageField.CostBasis];
    const usage = obj(row[ClaudeResultField.Usage]);
    const details = obj(usage[ClaudeUsageField.Details]);
    const parsed: ParsedRun = {
      text,
      usage: {
        inputTokens: num(usage[ClaudeUsageField.Input]),
        outputTokens: num(usage[ClaudeUsageField.Output]),
        cacheReadTokens: num(usage[ClaudeUsageField.CacheRead]),
        cacheWriteTokens: num(usage[ClaudeUsageField.CacheWrite]),
        reasoningTokens: num(details[ClaudeUsageField.Thinking]),
        totalTokens: null,
      },
      cost: {
        usd: num(row[ClaudeResultField.TotalCostUsd]),
        basis: basis === CostBasis.List ? CostBasis.List : CostBasis.Unreported,
      },
      model: firstModel ?? raw.requestedModel,
      sessionId: asSessionId(str(row[ClaudeResultField.SessionId]) ?? PromptText.Empty),
      unrecognised: [],
    };
    return ok(parsed);
  },

  textOf: () => null,

  helpArgs: null,

  checkHelp: () => ok(null),
};
