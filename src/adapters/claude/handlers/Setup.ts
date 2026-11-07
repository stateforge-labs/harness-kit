// Setup: command hooks only (http is not supported by Claude Code here). Output is discarded, so always {}.
import type { EventHandler } from "./types.ts";

export const handler: EventHandler = {
  event: "Setup",
  meta: (p) => ({ trigger: typeof p.trigger === "string" ? p.trigger : null }),
};
