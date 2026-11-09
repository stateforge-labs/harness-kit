import type { RunFailure } from "../core/failure.ts";
import { ToolSetting } from "../core/policy.ts";
import { ok, type Result } from "../core/result.ts";
import type { PolicyApplied, PolicyInput } from "../driver/port.ts";
import { CodexCli } from "./constants.ts";
import { CODEX_UNUSED_FEATURES } from "./exec.ts";

function emptyMcp(tools: PolicyInput["tools"]): boolean {
  return tools.mcp !== ToolSetting.HarnessDefault && tools.mcp.length === 0;
}

function sandboxArgs(): string[] {
  return [CodexCli.Sandbox, CodexCli.ReadOnly, ...CODEX_UNUSED_FEATURES.flatMap((feature) => [CodexCli.Disable, feature])];
}

export function codexPolicy(input: PolicyInput): Result<PolicyApplied, RunFailure> {
  const { tools } = input;
  const ignoreConfig = emptyMcp(tools) || tools.settings === ToolSetting.None;
  const sandbox = tools.builtins === ToolSetting.Off;
  const args = [
    ...(ignoreConfig || sandbox ? [CodexCli.SkipGitRepoCheck] : []),
    ...(ignoreConfig ? [CodexCli.IgnoreUserConfig] : []),
    ...(sandbox ? sandboxArgs() : []),
  ];
  return ok({ args, env: {} });
}
