// SessionStart: http not supported in Claude Code (needs a command shim). Context injection only: delegation rules via additionalContext.
import type { EventHandler } from "./types.ts";

const str = (v: unknown) => (typeof v === "string" ? v : null);

export const handler: EventHandler = {
  event: "SessionStart",
  // Session start type and model names only. No session_title, prompts or transcript paths.
  meta: (p) => ({
    source: str(p.source),
    model: str(p.model),
    agent_type: str(p.agent_type),
  }),
};
