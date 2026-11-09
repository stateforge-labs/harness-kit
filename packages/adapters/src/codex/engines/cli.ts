import { measuredValue } from "../../core/evidence.ts";
import type { RunFailure } from "../../core/failure.ts";
import { Hermetic } from "../../core/run.ts";
import { asSessionId } from "../../core/session.ts";
import { fail, ok, type Result } from "../../core/result.ts";
import { CostBasis, EngineReason, PromptText } from "../../driver/constants.ts";
import { budgetOf, checkArgv, exitFailure, gatesFor, modelFlag, neutralOrNative, NO_USAGE, unparsable } from "../../driver/kit.ts";
import type { CliEngine, EngineInput, Invocation, ParsedRun, RawRun } from "../../driver/port.ts";
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

export const codexCli: CliEngine<"codex"> = {
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

  interpret(raw: RawRun): Result<ParsedRun, RunFailure> {
    if (raw.exit.code !== 0) {
      return fail(exitFailure(raw, raw.stderrTail));
    }
    const text = raw.outFileText === null ? PromptText.Empty : raw.outFileText.trim();
    if (text === PromptText.Empty) {
      return fail(unparsable(EngineReason.EmptyLastMessage));
    }
    const session = raw.stdout.match(CodexStdout.Session)?.[1];
    const model = raw.stdout.match(CodexStdout.Model)?.[1];
    const tokens = raw.stdout.match(CodexStdout.Tokens)?.[1];
    const parsed: ParsedRun = {
      text,
      usage: {
        ...NO_USAGE,
        totalTokens: tokens === undefined ? null : Number(tokens.replace(CodexStdout.Grouping, PromptText.Empty)),
      },
      cost: { usd: null, basis: CostBasis.Unavailable },
      model: model ?? null,
      sessionId: asSessionId(session ?? PromptText.Empty),
      unrecognised: [],
    };
    return ok(parsed);
  },

  textOf: () => null,

  helpArgs: null,

  checkHelp: () => ok(null),
};
