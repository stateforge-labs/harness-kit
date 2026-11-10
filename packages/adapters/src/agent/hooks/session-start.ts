import { HookField, SESSION_START_SOURCE } from "./constants.ts";
import type { ClaudeHookName } from "@stateforge-labs/harness-hooks";

const CARRIED = [HookField.SessionId, HookField.TranscriptPath, HookField.Cwd] as const;

/** One flag per run: the first caller of `take` gets true, every later caller false. */
export interface SessionStartGate {
  take(): boolean;
}

export function sessionStartGate(): SessionStartGate {
  let taken = false;
  return {
    take(): boolean {
      if (taken) return false;
      taken = true;
      return true;
    },
  };
}

export function syntheticSessionStart(input: Readonly<Record<string, unknown>>, eventName: ClaudeHookName): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of CARRIED) if (input[key] !== undefined) out[key] = input[key];
  out[HookField.EventName] = eventName;
  out[HookField.Source] = SESSION_START_SOURCE;
  return out;
}
