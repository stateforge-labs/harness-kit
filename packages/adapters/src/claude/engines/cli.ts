import { CredentialMode } from "../../core/credential-plan.ts";
import { measuredValue } from "../../core/evidence.ts";
import type { RunFailure } from "../../core/failure.ts";
import { fail, ok, type Result } from "../../core/result.ts";
import { Hermetic } from "../../core/run.ts";
import { ArgvCarry } from "../../core/engine-constants.ts";
import { budgetOf, checkArgv, gatesFor, modelFlag, neutralOrNative } from "../../core/kit.ts";
import { cliEngine } from "../../engine/cli.ts";
import type { EngineInput, Invocation } from "../../driver/port.ts";
import { CLAUDE_CAPABILITIES } from "../capabilities.ts";
import { ClaudeArg, ClaudeCli, ClaudeSettingSources } from "../constants.ts";
import { CLAUDE_BINARY } from "../launch.ts";
import { CLAUDE_PROFILE } from "../profile.ts";
import { claudeLineEvents } from "./read-stream.ts";

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
    ClaudeCli.StreamJson,
    ClaudeCli.Verbose,
    ...(instructions === ClaudeArg.Empty ? [] : [ClaudeCli.SystemPrompt, instructions]),
    ...(effort === null ? [] : [ClaudeCli.Effort, effort]),
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

  parseLine: claudeLineEvents,
});
