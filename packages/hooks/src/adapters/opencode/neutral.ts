import { Kind, type NeutralKind } from "../../core/event.ts";
import { OpenCodeHook } from "./names.ts";

const KINDS: ReadonlyMap<string, NeutralKind> = new Map<string, NeutralKind>([
  [OpenCodeHook.SessionPrompt, Kind.PromptSubmit],
  [OpenCodeHook.ToolExecuteBefore, Kind.PreTool],
  [OpenCodeHook.ToolExecuteAfter, Kind.PostTool],
  [OpenCodeHook.PermissionEvaluate, Kind.PermissionRequest],
  [OpenCodeHook.SessionExperimentalIdle, Kind.Stop],
  [OpenCodeHook.SessionCompaction, Kind.PreCompact],
  [OpenCodeHook.SessionCompactionStarted, Kind.PreCompact],
  [OpenCodeHook.SessionCompactionEnded, Kind.PostCompact],
]);

export function kindOf(native: string, raw: Record<string, unknown>): NeutralKind {
  if (native === OpenCodeHook.SessionContext) return typeof raw.parentID === "string" ? Kind.SubagentStart : Kind.SessionStart;
  return KINDS.get(native) ?? Kind.Other;
}
