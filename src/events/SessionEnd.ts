// SessionEnd: supports http hooks. Observational and passive: no decision control, JSON output is discarded, so respond() is always {}.
import type { EventHandler } from "./types.ts";

export const handler: EventHandler = {
  event: "SessionEnd",
  meta: (p) => ({ reason: typeof p.reason === "string" ? p.reason : null }),
  respond: () => ({}),
};
