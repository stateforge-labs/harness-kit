import { type Capabilities, CapabilityName, Engine, isUsable, supportWhy } from "./capability.ts";
import { measuredValue } from "./evidence.ts";
import type { RunFailure } from "./failure.ts";
import { argvBytes, longestArgBytes, tailBytes } from "./limits.ts";
import type { Profile } from "./profile.ts";
import { fail, ok, type Result } from "./result.ts";
import { type Effort, Hermetic, type TokenUsage } from "./run.ts";
import { ArgvField, EffortName, EngineMessage, FAILURE_TAIL_BYTES, PromptText } from "./engine-constants.ts";
import type { ProcessExit, ResolvedOptions } from "./raw-run.ts";

export const NO_USAGE: TokenUsage = {
  inputTokens: null,
  outputTokens: null,
  cacheReadTokens: null,
  cacheWriteTokens: null,
  reasoningTokens: null,
  totalTokens: null,
};

export function unsupportedFor(capability: CapabilityName, why: string): RunFailure {
  return { kind: "unsupported", message: EngineMessage.Unsupported, capability, engine: Engine.Cli, why };
}

export function requireCapability(caps: Capabilities, capability: CapabilityName): RunFailure | null {
  const support = caps[capability][Engine.Cli];
  return isUsable(support) ? null : unsupportedFor(capability, supportWhy(support));
}

export function effortIsSet(effort: Effort | null): boolean {
  return effort !== null && effort !== EffortName.HarnessDefault;
}

export function gatesFor(caps: Capabilities, options: ResolvedOptions): RunFailure | null {
  if (effortIsSet(options.effort)) {
    const effort = requireCapability(caps, CapabilityName.Effort);
    if (effort !== null) {
      return effort;
    }
  }
  if (!options.persist) {
    const ephemeral = requireCapability(caps, CapabilityName.Ephemeral);
    if (ephemeral !== null) {
      return ephemeral;
    }
  }
  if (options.hermetic === Hermetic.Full) {
    return requireCapability(caps, CapabilityName.SettingsSources);
  }
  return null;
}

export function neutralOrNative(effort: Effort | null, accepted: readonly string[] | null): Result<string | null, RunFailure> {
  if (effort === null || effort === EffortName.HarnessDefault) {
    return ok(null);
  }
  if (typeof effort === "string") {
    return ok(effort);
  }
  if (accepted === null) {
    return fail(unsupportedFor(CapabilityName.Effort, EngineMessage.EffortUnmeasured));
  }
  if (!accepted.includes(effort.native)) {
    return fail(unsupportedFor(CapabilityName.Effort, EngineMessage.EffortRejected));
  }
  return ok(effort.native);
}

export function modelFlag(flag: string, model: string | null): string[] {
  return model === null || model === PromptText.Empty ? [] : [flag, model];
}

export interface ArgvBudget {
  readonly total: number | null;
  readonly arg: number | null;
}

export function budgetOf(options: ResolvedOptions, profile: Profile): ArgvBudget {
  return { total: options.maxArgvBytes ?? measuredValue(profile.limits.maxArgvBytes), arg: measuredValue(profile.limits.maxArgBytes) };
}

export function checkArgv(args: readonly string[], budget: ArgvBudget): RunFailure | null {
  const total = argvBytes(args);
  if (budget.total !== null && total > budget.total) {
    return { kind: "too-large", message: EngineMessage.ArgvTooLarge, limitBytes: budget.total, actualBytes: total, field: ArgvField.Instructions };
  }
  const longest = longestArgBytes(args);
  if (budget.arg !== null && longest > budget.arg) {
    return { kind: "too-large", message: EngineMessage.ArgTooLarge, limitBytes: budget.arg, actualBytes: longest, field: ArgvField.Instructions };
  }
  return null;
}

export function exitFailure(exit: ProcessExit, stderrTail: string): RunFailure {
  return {
    kind: "exit",
    message: EngineMessage.Exit,
    code: exit.code,
    signal: exit.signal,
    stderrTail: tailBytes(stderrTail, FAILURE_TAIL_BYTES),
  };
}

export function unparsable(reason: string): RunFailure {
  return { kind: "unparsable", message: EngineMessage.Unparsable, reason };
}
