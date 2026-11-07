// PostToolBatch supports the http hook type in Claude Code. Passive: it never injects context or blocks, so respond() is always {}.
import type { EventHandler, HookPayload } from "./types.ts";

/** The tool_calls array, or [] when the key is absent or not an array. */
const callsOf = (p: HookPayload): Record<string, unknown>[] =>
  Array.isArray(p.tool_calls) ? (p.tool_calls as Record<string, unknown>[]) : [];

export const handler: EventHandler = {
  event: "PostToolBatch",
  meta: (p) => {
    const calls = callsOf(p);
    const names = [...new Set(calls.map((c) => (typeof c.tool_name === "string" ? c.tool_name : "unknown")))];
    return { tool_calls: calls.length, tool_names: names.join(",") };
  },
};
