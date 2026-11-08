import type { EventHandler, HookPayload } from "./types.ts";
import { ClaudeHook } from "../names.ts";

const callsOf = (p: HookPayload): Record<string, unknown>[] =>
  Array.isArray(p.tool_calls) ? (p.tool_calls as Record<string, unknown>[]) : [];

export const handler: EventHandler = {
  event: ClaudeHook.PostToolBatch,
  meta: (p) => {
    const calls = callsOf(p);
    const names = [...new Set(calls.map((c) => (typeof c.tool_name === "string" ? c.tool_name : "unknown")))];
    return { tool_calls: calls.length, tool_names: names.join(",") };
  },
};
