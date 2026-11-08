import { OpenCodeHook, type OpenCodeHookName } from "../../src/adapters/opencode/names.ts";

export type HookArea = "tool" | "permission" | "session";

export const FORWARDED_HOOKS: readonly OpenCodeHookName[] = [
  OpenCodeHook.ToolExecuteBefore,
  OpenCodeHook.ToolExecuteAfter,
  OpenCodeHook.PermissionEvaluate,
  OpenCodeHook.SessionPrompt,
  OpenCodeHook.SessionExperimentalIdle,
  OpenCodeHook.SessionCompaction,
];

export const FORWARDED_EVENTS: ReadonlySet<string> = new Set<OpenCodeHookName>([
  OpenCodeHook.SessionCreated,
  OpenCodeHook.SessionExecutionStarted,
  OpenCodeHook.SessionExecutionSucceeded,
  OpenCodeHook.SessionExecutionFailed,
  OpenCodeHook.SessionExecutionInterrupted,
  OpenCodeHook.SessionCompactionStarted,
  OpenCodeHook.SessionCompactionEnded,
  OpenCodeHook.SessionCompactionFailed,
]);

export function splitHook(hook: OpenCodeHookName): { area: HookArea; name: string } {
  const dot = hook.indexOf(".");
  return { area: hook.slice(0, dot) as HookArea, name: hook.slice(dot + 1) };
}
