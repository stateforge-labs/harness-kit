import { Kind, type NeutralKind } from "../../core/event.ts";
import { CodexHook } from "./names.ts";

const KINDS: ReadonlyMap<string, NeutralKind> = new Map<string, NeutralKind>([
  [CodexHook.SessionStart, Kind.SessionStart],
  [CodexHook.SessionEnd, Kind.SessionEnd],
  [CodexHook.UserPromptSubmit, Kind.PromptSubmit],
  [CodexHook.PreToolUse, Kind.PreTool],
  [CodexHook.PostToolUse, Kind.PostTool],
  [CodexHook.PermissionRequest, Kind.PermissionRequest],
  [CodexHook.SubagentStart, Kind.SubagentStart],
  [CodexHook.SubagentStop, Kind.SubagentStop],
  [CodexHook.Stop, Kind.Stop],
  [CodexHook.PreCompact, Kind.PreCompact],
  [CodexHook.PostCompact, Kind.PostCompact],
]);

export const kindOf = (native: string): NeutralKind => KINDS.get(native) ?? Kind.Other;
