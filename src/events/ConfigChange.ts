// ConfigChange: passive, never blocks a settings change; http hook type is supported.
import type { EventHandler } from "./types.ts";

export const handler: EventHandler = {
  event: "ConfigChange",
  required: ["source"],
  meta: (p) => ({ source: typeof p.source === "string" ? p.source : null }),
  respond: () => ({}),
};
