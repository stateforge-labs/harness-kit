import { measuredValue } from "../../core/evidence.ts";
import type { RunFailure } from "../../core/failure.ts";
import { Hermetic } from "../../core/run.ts";
import { asSessionId } from "../../core/session.ts";
import { fail, ok, type Result } from "../../core/result.ts";
import { CostBasis, EngineReason, PromptText } from "../../core/engine-constants.ts";
import { budgetOf, checkArgv, exitFailure, gatesFor, modelFlag, neutralOrNative, NO_USAGE, unparsable } from "../../core/kit.ts";
import { cliEngine } from "../../engine/cli.ts";
import type { AfterContext, EngineEvent, EngineInput, Invocation } from "../../driver/port.ts";
import { CODEX_CAPABILITIES } from "../capabilities.ts";
import { CODEX_BINARY, CODEX_UNUSED_FEATURES } from "../exec.ts";
import { CodexCli, CodexStdout } from "../constants.ts";
import { CODEX_PROFILE } from "../profile.ts";

function codexArgs(input: EngineInput<"codex">, effort: string | null): string[] {
  const { options } = input;
  const full = options.hermetic === Hermetic.Full;
  return [
    CodexCli.Exec,
    ...(options.persist ? [] : [CodexCli.Ephemeral]),
    ...(full ? [CodexCli.SkipGitRepoCheck, CodexCli.IgnoreUserConfig, CodexCli.Sandbox, CodexCli.ReadOnly] : []),
    CodexCli.Color,
    CodexCli.ColorNever,
    ...modelFlag(CodexCli.Model, options.model),
    ...(effort === null ? [] : [CodexCli.Config, `${CodexCli.ReasoningEffortKey}=${effort}`]),
    ...(full ? CODEX_UNUSED_FEATURES.flatMap((feature) => [CodexCli.Disable, feature]) : []),
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
    const args = codexArgs(input, effort.value);
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
    };
    return ok(invocation);
  },

  parseLine: () => [],

  after: (ctx) => Promise.resolve(codexEvents(ctx)),
});
