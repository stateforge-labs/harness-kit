import type { RunFailure } from "../core/failure.ts";
import { ToolSetting } from "../core/policy.ts";
import { ok, type Result } from "../core/result.ts";
import type { PolicyApplied, PolicyInput } from "../driver/port.ts";
import { EnvVar } from "../env.ts";
import { OPENCODE_CONFIG_DIR_PLACEHOLDER, OPENCODE_ENV_ON, OpenCodeBuiltinActions, OpenCodeEnvName, OpenCodeMcpActions } from "./constants.ts";
import { opencodeDenyConfig } from "./launch.ts";

function deniedActions(input: PolicyInput): string[] {
  const builtins = input.tools.builtins === ToolSetting.Off ? OpenCodeBuiltinActions : [];
  const mcp = Array.isArray(input.tools.mcp) && input.tools.mcp.length === 0 ? OpenCodeMcpActions : [];
  return [...builtins, ...mcp];
}

export function opencodePolicy(input: PolicyInput): Result<PolicyApplied, RunFailure> {
  const env: Record<string, string> = {};
  const denied = deniedActions(input);
  if (denied.length > 0) {
    env[EnvVar.OpenCodeConfigContent] = opencodeDenyConfig(denied);
  }
  if (input.tools.settings === ToolSetting.None) {
    env[OpenCodeEnvName.ConfigDir] = OPENCODE_CONFIG_DIR_PLACEHOLDER;
    env[OpenCodeEnvName.DisableProjectConfig] = OPENCODE_ENV_ON;
    env[OpenCodeEnvName.DisableClaudeCode] = OPENCODE_ENV_ON;
  }
  return ok({ args: [], env });
}
