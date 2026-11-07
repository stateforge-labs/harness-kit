// Stop: permission mode and the stop-hook flag. Never the last assistant message.
import type { EventHandler } from "./types.ts";

const str = (v: unknown) => (typeof v === "string" ? v : null);

export const handler: EventHandler = {
  event: "Stop",
  meta: (p) => ({
    permission_mode: str(p.permission_mode),
    stop_hook_active: typeof p.stop_hook_active === "boolean" ? p.stop_hook_active : null,
  }),
};
