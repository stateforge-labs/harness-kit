import { Engine } from "../../core/capability.ts";
import { ToolSetting } from "../../core/policy.ts";
import { UnavailableReason, type RunFailure } from "../../core/failure.ts";
import { fail, ok, type Result } from "../../core/result.ts";
import { asSessionId } from "../../core/session.ts";
import type { Cost } from "../../core/run.ts";
import { ArgvCarry, CostBasis, EngineCapability, EngineMessage, EngineReason, PromptText } from "../../core/engine-constants.ts";
import { budgetOf, checkArgv, exitFailure, gatesFor, modelFlag, NO_USAGE, unparsable } from "../../core/kit.ts";
import { cliEngine } from "../../engine/cli.ts";
import type { CleanupContext, CliEngine, CliEngineParts, EngineEnd, EngineEvent, EngineInput, EngineIo, EngineRun, EngineRunInput, Invocation } from "../../driver/port.ts";
import { OPENCODE_CAPABILITIES } from "../capabilities.ts";
import { OPENCODE_CONFIG_DIR_PLACEHOLDER, OpenCodeCli, OpenCodeMessage } from "../constants.ts";
import { OPENCODE_BINARY } from "../launch.ts";
import { opencodePolicy } from "../policy.ts";
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

function withConfigDir(env: Readonly<Record<string, string>>, configDir: string): Record<string, string> {
  const filled: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) {
    filled[name] = value === OPENCODE_CONFIG_DIR_PLACEHOLDER ? configDir : value;
  }
  return filled;
}

function opencodeParts(configDir: string | null): CliEngineParts<"opencode"> {
  return {
    invocation(input: EngineInput<"opencode">): Result<Invocation, RunFailure> {
      const gate = gatesFor(OPENCODE_CAPABILITIES, input.options);
      if (gate !== null) {
        return fail(gate);
      }
      const policy = opencodePolicy({ tools: input.options.tools, credentialMode: input.credential.mode });
      if (!policy.ok) {
        return fail(policy.failure);
      }
      const args = [...opencodeArgs(input.options.model, input.runId), ...policy.value.args];
      const over = checkArgv(args, budgetOf(input.options, OPENCODE_PROFILE));
      if (over !== null) {
        return fail(over);
      }
      const env = configDir === null ? policy.value.env : withConfigDir(policy.value.env, configDir);
      const invocation: Invocation = {
        program: OPENCODE_BINARY,
        args,
        stdin: `${input.instructions}${PromptText.Separator}${input.input}`,
        outFile: null,
        argvCarries: [ArgvCarry.Instructions],
        ...(Object.keys(env).length === 0 ? {} : { env }),
      };
      return ok(invocation);
    },

    parseLine: opencodeLineEvents,

    async cleanup(ctx: CleanupContext): Promise<void> {
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
  };
}

function abortedFailure(): RunFailure {
  return { kind: "aborted", message: OpenCodeMessage.Aborted };
}

function scratchFailure(): RunFailure {
  return { kind: "unavailable", message: OpenCodeMessage.ScratchFailed, reason: UnavailableReason.ScratchFailed };
}

type Settled = Result<EngineEnd, RunFailure>;

function withScratchConfigDir(input: EngineRunInput<"opencode">, io: EngineIo): EngineRun {
  let inner: EngineRun | null = null;
  let begun = false;
  let cancelled = false;
  let settled = false;
  let resolveDone: (result: Settled) => void = () => {};
  const done = new Promise<Settled>((resolve) => {
    resolveDone = resolve;
  });
  const finish = (result: Settled): void => {
    if (!settled) {
      settled = true;
      resolveDone(result);
    }
  };

  async function* events(): AsyncGenerator<EngineEvent, void, undefined> {
    begun = true;
    const dir = await input.host.scratch();
    if (dir === null) {
      finish(fail(scratchFailure()));
      return;
    }
    if (cancelled) {
      finish(fail(abortedFailure()));
      return;
    }
    inner = cliEngine(opencodeParts(dir)).start(input, io);
    yield* inner.events;
    finish(await inner.done);
  }

  return {
    events: events(),
    cancel() {
      cancelled = true;
      inner?.cancel();
      if (!begun) {
        finish(fail(abortedFailure()));
      }
    },
    done,
  };
}

const planned: CliEngine<"opencode"> = cliEngine(opencodeParts(null));

export const opencodeCli: CliEngine<"opencode"> = {
  ...planned,
  start(input, io) {
    return input.options.tools.settings === ToolSetting.None ? withScratchConfigDir(input, io) : planned.start(input, io);
  },
};
