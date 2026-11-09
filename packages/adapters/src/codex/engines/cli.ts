import { measuredValue } from "../../core/evidence.ts";
import type { RunFailure } from "../../core/failure.ts";
import { asSessionId } from "../../core/session.ts";
import { fail, ok, type Result } from "../../core/result.ts";
import { CostBasis, EngineReason, PromptText } from "../../core/engine-constants.ts";
import { budgetOf, checkArgv, exitFailure, gatesFor, modelFlag, neutralOrNative, NO_USAGE, unparsable } from "../../core/kit.ts";
import { cliEngine } from "../../engine/cli.ts";
import type { AfterContext, EngineEvent, EngineInput, Invocation } from "../../driver/port.ts";
import { CODEX_CAPABILITIES } from "../capabilities.ts";
import { CODEX_BINARY } from "../exec.ts";
import { codexPolicy } from "../policy.ts";
import { CodexCli, CodexStdout } from "../constants.ts";
import { CODEX_PROFILE } from "../profile.ts";

function codexArgs(input: EngineInput<"codex">, effort: string | null, policy: readonly string[]): string[] {
  const { options } = input;
  return [
    CodexCli.Exec,
    ...(options.persist ? [] : [CodexCli.Ephemeral]),
    ...policy,
    CodexCli.Color,
    CodexCli.ColorNever,
    ...modelFlag(CodexCli.Model, options.model),
    ...(effort === null ? [] : [CodexCli.Config, `${CodexCli.ReasoningEffortKey}=${effort}`]),
    CodexCli.Output,
    input.outFile,
    CodexCli.Stdin,
  ];
}

function codexEvents(ctx: AfterContext): readonly EngineEvent[] {
  if (ctx.end.exit.code !== 0) {
    return [];
  }
  const text = ctx.outFileText === null ? PromptText.Empty : ctx.outFileText.trim();
  if (text === PromptText.Empty) {
    return [{ kind: "failure", failure: unparsable(EngineReason.EmptyLastMessage) }];
  }
  const session = asSessionId(ctx.stdoutTail.match(CodexStdout.Session)?.[1] ?? PromptText.Empty);
  const model = ctx.stdoutTail.match(CodexStdout.Model)?.[1];
  const tokens = ctx.stdoutTail.match(CodexStdout.Tokens)?.[1];
  return [
    { kind: "final", text },
    { kind: "usage", usage: { ...NO_USAGE, totalTokens: tokens === undefined ? null : Number(tokens.replace(CodexStdout.Grouping, PromptText.Empty)) } },
    { kind: "cost", cost: { usd: null, basis: CostBasis.Unavailable } },
    ...(model === undefined ? [] : [{ kind: "model" as const, model }]),
    ...(session === null ? [] : [{ kind: "session" as const, id: session }]),
  ];
}

export const codexCli = cliEngine<"codex">({
  invocation(input): Result<Invocation, RunFailure> {
    const gate = gatesFor(CODEX_CAPABILITIES, input.options);
    if (gate !== null) {
      return fail(gate);
    }
    const effort = neutralOrNative(input.options.effort, measuredValue(CODEX_PROFILE.effort.accepted));
    if (!effort.ok) {
      return fail(effort.failure);
    }
    const policy = codexPolicy({ tools: input.options.tools, credentialMode: input.credential.mode });
    if (!policy.ok) {
      return fail(policy.failure);
    }
    const args = codexArgs(input, effort.value, policy.value.args);
    const over = checkArgv(args, budgetOf(input.options, CODEX_PROFILE));
    if (over !== null) {
      return fail(over);
    }
    const invocation: Invocation = {
      program: CODEX_BINARY,
      args,
      stdin: `${input.instructions}${PromptText.Separator}${input.input}`,
      outFile: input.outFile,
      argvCarries: [],
      env: policy.value.env,
    };
    return ok(invocation);
  },

  parseLine: () => [],

  after: (ctx) => Promise.resolve(codexEvents(ctx)),
});
