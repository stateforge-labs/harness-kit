import { Engine } from "../../core/capability.ts";
import type { RunFailure } from "../../core/failure.ts";
import { fail, ok, type Result } from "../../core/result.ts";
import { asSessionId } from "../../core/session.ts";
import type { Cost } from "../../core/run.ts";
import { ArgvCarry, CostBasis, EngineCapability, EngineMessage, EngineReason, PromptText } from "../../driver/constants.ts";
import { budgetOf, checkArgv, exitFailure, gatesFor, modelFlag, NO_USAGE, unparsable } from "../../driver/kit.ts";
import type { CliEngine, EngineInput, Invocation, ParsedRun, RawRun } from "../../driver/port.ts";
import { OPENCODE_CAPABILITIES } from "../capabilities.ts";
import { OpenCodeCli } from "../constants.ts";
import { OPENCODE_BINARY } from "../launch.ts";
import { OPENCODE_PROFILE } from "../profile.ts";
import { opencodeTextOf, readOpencodeRun } from "./read-run.ts";

function opencodeArgs(model: string | null): string[] {
  return [
    OpenCodeCli.Run,
    OpenCodeCli.Standalone,
    OpenCodeCli.Format,
    OpenCodeCli.FormatJson,
    OpenCodeCli.Title,
    OpenCodeCli.StaticTitle,
    ...modelFlag(OpenCodeCli.Model, model),
  ];
}

export const opencodeCli: CliEngine<"opencode"> = {
  invocation(input: EngineInput<"opencode">): Result<Invocation, RunFailure> {
    const gate = gatesFor(OPENCODE_CAPABILITIES, input.options);
    if (gate !== null) {
      return fail(gate);
    }
    const args = opencodeArgs(input.options.model);
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

  interpret(raw: RawRun): Result<ParsedRun, RunFailure> {
    const reading = readOpencodeRun(raw.stdout);
    if (raw.exit.code !== 0 || reading.error !== null) {
      return fail(exitFailure(raw, reading.error === null ? raw.stderrTail : reading.error.message));
    }
    if (reading.text === PromptText.Empty) {
      return fail(unparsable(EngineReason.EmptyText));
    }
    const cost: Cost = reading.cost === null ? { usd: null, basis: CostBasis.Unreported } : { usd: reading.cost, basis: CostBasis.List };
    const parsed: ParsedRun = {
      text: reading.text,
      usage: NO_USAGE,
      cost,
      model: null,
      sessionId: asSessionId(reading.sessionId ?? PromptText.Empty),
      unrecognised: reading.unknownRows,
    };
    return ok(parsed);
  },

  textOf: opencodeTextOf,

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
};
