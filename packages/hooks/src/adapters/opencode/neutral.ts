import { Kind, type NeutralKind } from "../../core/event.ts";
import { OpenCodeHook } from "./names.ts";

const KINDS: ReadonlyMap<string, NeutralKind> = new Map<string, NeutralKind>([
  [OpenCodeHook.SessionCreated, Kind.SessionStart],
  [OpenCodeHook.SessionPrompt, Kind.PromptSubmit],
  [OpenCodeHook.ToolExecuteBefore, Kind.PreTool],
  [OpenCodeHook.ToolExecuteAfter, Kind.PostTool],
  [OpenCodeHook.PermissionEvaluate, Kind.PermissionRequest],
  [OpenCodeHook.SessionExperimentalIdle, Kind.Stop],
  [OpenCodeHook.SessionCompaction, Kind.PreCompact],
  [OpenCodeHook.SessionCompactionStarted, Kind.PreCompact],
  [OpenCodeHook.SessionCompactionEnded, Kind.PostCompact],
]);

export const kindOf = (native: string): NeutralKind => KINDS.get(native) ?? Kind.Other;
