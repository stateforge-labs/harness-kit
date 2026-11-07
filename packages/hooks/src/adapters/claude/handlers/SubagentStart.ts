import type { EventHandler } from "./types.ts";

// SubagentStart: http supported. Context only (hookSpecificOutput.additionalContext); cannot block.
// Measured (captures SubagentStart-1, -4, -5): systemMessage shows only as a subagent-transcript hook_system_message and never reaches
// the model; continue:false does not stop the subagent. This handler returns neither. Strings over 10,000 chars are spilled, not truncated.
export const handler: EventHandler = {
  event: "SubagentStart",
  meta: (p) => ({ agent_type: typeof p.agent_type === "string" ? p.agent_type : null }),
};
