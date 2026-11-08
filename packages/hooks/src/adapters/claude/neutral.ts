import { Kind, type NeutralKind } from "../../core/event.ts";
import { ClaudeHook } from "./names.ts";

const KINDS: ReadonlyMap<string, NeutralKind> = new Map<string, NeutralKind>([
  [ClaudeHook.SessionStart, Kind.SessionStart],
  [ClaudeHook.SessionEnd, Kind.SessionEnd],
  [ClaudeHook.UserPromptSubmit, Kind.PromptSubmit],
  [ClaudeHook.PreToolUse, Kind.PreTool],
  [ClaudeHook.PostToolUse, Kind.PostTool],
  [ClaudeHook.PostToolUseFailure, Kind.PostToolFailure],
  [ClaudeHook.PermissionRequest, Kind.PermissionRequest],
  [ClaudeHook.SubagentStart, Kind.SubagentStart],
  [ClaudeHook.SubagentStop, Kind.SubagentStop],
  [ClaudeHook.Stop, Kind.Stop],
  [ClaudeHook.PreCompact, Kind.PreCompact],
  [ClaudeHook.PostCompact, Kind.PostCompact],
]);

export const kindOf = (native: string): NeutralKind => KINDS.get(native) ?? Kind.Other;
