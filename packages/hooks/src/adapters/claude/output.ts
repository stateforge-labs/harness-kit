import type { HookOutputRules } from "../hook-output.ts";
import { ClaudeHook } from "./names.ts";

export const output: HookOutputRules = {
  preTool: ClaudeHook.PreToolUse,
  permission: ClaudeHook.PermissionRequest,
  context: new Set([ClaudeHook.SessionStart, ClaudeHook.SubagentStart, ClaudeHook.PreToolUse]),
  stop: new Set([ClaudeHook.Stop, ClaudeHook.SubagentStop]),
  worktreeCreate: ClaudeHook.WorktreeCreate,
};
