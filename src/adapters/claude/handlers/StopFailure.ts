// StopFailure: http supported. Passive: Claude Code ignores output except terminalSequence (interactive-only), so this returns {}.
import type { EventHandler } from "./types.ts";

const str = (v: unknown) => (typeof v === "string" ? v : null);

export const handler: EventHandler = {
  event: "StopFailure",
  // Error category only. error_details and last_assistant_message may carry text, so they are never logged.
  meta: (p) => ({ error: str(p.error) }),
};
