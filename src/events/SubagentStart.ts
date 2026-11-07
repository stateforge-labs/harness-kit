import { SUBAGENT_START_RULES } from "../rules.ts";
import type { EventHandler } from "./types.ts";

// SubagentStart: http supported. Context only (hookSpecificOutput.additionalContext); cannot block.
export const handler: EventHandler = {
  event: "SubagentStart",
  required: ["agent_id", "agent_type"],
  meta: (p) => ({ agent_type: typeof p.agent_type === "string" ? p.agent_type : null }),
  respond: () => ({
    hookSpecificOutput: { hookEventName: "SubagentStart", additionalContext: SUBAGENT_START_RULES },
  }),
};
