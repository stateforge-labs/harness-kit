import type { RunFailure } from "../core/failure.ts";
import { ToolSetting } from "../core/policy.ts";
import { ok, type Result } from "../core/result.ts";
import type { PolicyApplied, PolicyInput } from "../driver/port.ts";
import { CodexCli } from "./constants.ts";
import { CODEX_UNUSED_FEATURES } from "./exec.ts";

function lockdownArgs(): string[] {
  return [
    CodexCli.SkipGitRepoCheck,
    CodexCli.IgnoreUserConfig,
    CodexCli.Sandbox,
    CodexCli.ReadOnly,
    ...CODEX_UNUSED_FEATURES.flatMap((feature) => [CodexCli.Disable, feature]),
  ];
}

export function codexPolicy(input: PolicyInput): Result<PolicyApplied, RunFailure> {
  const { tools } = input;
  const locked = tools.builtins === ToolSetting.Off || tools.settings === ToolSetting.None;
  return ok({ args: locked ? lockdownArgs() : [], env: {} });
}
