import { SUBAGENT_START_RULES } from "../rules.ts";
import type { EventHandler } from "./types.ts";

export const handler: EventHandler = {
  event: "SubagentStart",
  required: [],
  meta: () => ({}),
  respond: () => ({
    hookSpecificOutput: { hookEventName: "SubagentStart", additionalContext: SUBAGENT_START_RULES },
  }),
};
