import { Engine } from "../../core/capability.ts";
import type { RunFailure } from "../../core/failure.ts";
import { fail, ok, type Result } from "../../core/result.ts";
import { asSessionId } from "../../core/session.ts";
import type { Cost } from "../../core/run.ts";
import { ArgvCarry, CostBasis, EngineCapability, EngineMessage, EngineReason, PromptText } from "../../core/engine-constants.ts";
import { budgetOf, checkArgv, exitFailure, gatesFor, modelFlag, NO_USAGE, unparsable } from "../../core/kit.ts";
import { cliEngine } from "../../engine/cli.ts";
import type { CleanupContext, EngineInput, Invocation } from "../../driver/port.ts";
import { OPENCODE_CAPABILITIES } from "../capabilities.ts";
import { OpenCodeCli } from "../constants.ts";
import { OPENCODE_BINARY } from "../launch.ts";
import { OPENCODE_PROFILE } from "../profile.ts";
import { removeResidue, runTitle } from "./cleanup.ts";
import { opencodeLineEvents } from "./read-run.ts";

function opencodeArgs(model: string | null, runId: string): string[] {
  return [
    OpenCodeCli.Run,
    OpenCodeCli.Standalone,
    OpenCodeCli.Format,
    OpenCodeCli.FormatJson,
    OpenCodeCli.Title,
    `${OpenCodeCli.StaticTitle}${OpenCodeCli.TitleSeparator}${runId}`,
    ...modelFlag(OpenCodeCli.Model, model),
  ];
}

function observedSession(ctx: CleanupContext): string | null {
  let session: string | null = null;
  for (const line of ctx.stdoutTail.split(PromptText.Line)) {
    for (const event of opencodeLineEvents(line)) {
      session = event.kind === "session" ? event.id : session;
    }
  }
  return session;
}

export const opencodeCli = cliEngine<"opencode">({
  invocation(input: EngineInput<"opencode">): Result<Invocation, RunFailure> {
    const gate = gatesFor(OPENCODE_CAPABILITIES, input.options);
    if (gate !== null) {
      return fail(gate);
    }
    const args = opencodeArgs(input.options.model, input.runId);
    const over = checkArgv(args, budgetOf(input.options, OPENCODE_PROFILE));
    if (over !== null) {
      return fail(over);
    }
    const invocation: Invocation = {
      program: OPENCODE_BINARY,
      args,
      stdin: `${input.instructions}${PromptText.Separator}${input.input}`,
      outFile: null,
      argvCarries: [ArgvCarry.Instructions],
    };
    return ok(invocation);
  },

  parseLine: opencodeLineEvents,

  async cleanup(ctx): Promise<void> {
    await removeResidue(ctx, runTitle(ctx.input.invocation.args), observedSession(ctx));
  },

  helpArgs: [OpenCodeCli.Run, OpenCodeCli.Help],

  checkHelp(help: string): Result<null, RunFailure> {
    if (help.includes(OpenCodeCli.Standalone)) {
      return ok(null);
    }
    return fail({
      kind: "unsupported",
      message: EngineMessage.Unsupported,
      capability: EngineCapability.Standalone,
      engine: Engine.Cli,
      why: EngineMessage.StandaloneMissing,
    });
  },
});
