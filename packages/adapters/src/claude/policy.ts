import { CredentialMode } from "../core/credential-plan.ts";
import type { RunFailure } from "../core/failure.ts";
import { ToolSetting } from "../core/policy.ts";
import { ok, type Result } from "../core/result.ts";
import type { PolicyApplied, PolicyInput } from "../driver/port.ts";
import { ClaudeArg, ClaudeCli, ClaudeSettingSources } from "./constants.ts";

function keepsUserSettings(credentialMode: string): boolean {
  return credentialMode === CredentialMode.LoginStore || credentialMode === CredentialMode.Token;
}

function settingsArgs(input: PolicyInput): readonly string[] {
  if (input.tools.settings === ToolSetting.None) {
    return [ClaudeCli.SettingSources, ClaudeArg.Empty];
  }
  return keepsUserSettings(input.credentialMode) ? [ClaudeCli.SettingSources, ClaudeSettingSources.NoUser] : [];
}

export function claudePolicy(input: PolicyInput): Result<PolicyApplied, RunFailure> {
  const { tools } = input;
  const mcpNone = Array.isArray(tools.mcp) && tools.mcp.length === 0;
  const args = [
    ...(tools.builtins === ToolSetting.Off ? [ClaudeCli.Tools, ClaudeArg.Empty] : []),
    ...(mcpNone ? [ClaudeCli.StrictMcpConfig] : []),
    ...settingsArgs(input),
  ];
  return ok({ args, env: {} });
}
