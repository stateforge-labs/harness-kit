import { dirname, join } from "node:path";
import { measuredValue } from "../../core/evidence.ts";
import type { RunFailure } from "../../core/failure.ts";
import { asSessionId } from "../../core/session.ts";
import { fail, ok, type Result } from "../../core/result.ts";
import { Engine, UnsupportedReason } from "../../core/capability.ts";
import { CostBasis, EngineCapability, EngineMessage, EngineReason, PromptText } from "../../core/engine-constants.ts";
import { budgetOf, checkArgv, exitFailure, gatesFor, modelFlag, neutralOrNative, NO_USAGE, unparsable } from "../../core/kit.ts";
import { parseRow, isJsonValue } from "../../core/rows.ts";
import { cliEngine } from "../../engine/cli.ts";
import type { AfterContext, EngineEvent, EngineInput, Invocation } from "../../driver/port.ts";
import { CODEX_CAPABILITIES } from "../capabilities.ts";
import { CODEX_BINARY } from "../exec.ts";
import { codexPolicy } from "../policy.ts";
import { CodexCli, CodexFile, CodexStdout } from "../constants.ts";
import { CODEX_PROFILE } from "../profile.ts";

function schemaPath(outFile: string): string {
  return join(dirname(outFile), CodexFile.Schema);
}

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
    ...(options.outputSchema === undefined ? [] : [CodexCli.OutputSchema, schemaPath(input.outFile)]),
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
  const schema = ctx.input.options.outputSchema;
  const row = schema === undefined ? null : parseRow(text);
  if (schema !== undefined && (row === null || !isJsonValue(row))) {
    return [{ kind: "failure", failure: unparsable(EngineReason.NotJson) }];
  }
  const structured = row !== null && isJsonValue(row) ? [{ kind: "output" as const, value: row }] : [];
  const session = asSessionId(ctx.stdoutTail.match(CodexStdout.Session)?.[1] ?? PromptText.Empty);
  const model = ctx.stdoutTail.match(CodexStdout.Model)?.[1];
  const tokens = ctx.stdoutTail.match(CodexStdout.Tokens)?.[1];
  return [
    { kind: "final", text },
    ...structured,
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
    if (input.options.maxTurns !== undefined) {
      return fail({ kind: "unsupported", message: EngineMessage.Unsupported, capability: EngineCapability.MaxTurns, engine: Engine.Cli, why: UnsupportedReason.HarnessLimit });
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
    const schema = input.options.outputSchema;
    const invocation: Invocation = {
      program: CODEX_BINARY,
      args,
      stdin: `${input.instructions}${PromptText.Separator}${input.input}`,
      outFile: input.outFile,
      argvCarries: [],
      env: policy.value.env,
      ...(schema === undefined ? {} : { files: { [schemaPath(input.outFile)]: JSON.stringify(schema) } }),
    };
    return ok(invocation);
  },

  parseLine: () => [],

  after: (ctx) => Promise.resolve(codexEvents(ctx)),
});
