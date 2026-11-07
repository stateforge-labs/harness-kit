import { SESSION_START_RULES } from "../rules.ts";
import type { EventHandler } from "./types.ts";

export const handler: EventHandler = {
  event: "SessionStart",
  required: [],
  meta: (p) => ({ source: typeof p.source === "string" ? p.source : null }),
  respond: () => ({
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: SESSION_START_RULES },
  }),
};
