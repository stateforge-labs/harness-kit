import type { HookOutputRules } from "../hook-output.ts";
import { CodexHook } from "./names.ts";

export const output: HookOutputRules = {
  preTool: CodexHook.PreToolUse,
  permission: CodexHook.PermissionRequest,
  context: new Set([CodexHook.PreToolUse, CodexHook.SessionStart, CodexHook.SubagentStart, CodexHook.UserPromptSubmit]),
  stop: new Set([CodexHook.Stop, CodexHook.SubagentStop]),
};
