// Stop: http hooks are supported (command shim not needed). Passive: always {}, since additionalContext would continue the turn.
import type { EventHandler } from "./types.ts";

export const handler: EventHandler = {
  event: "Stop",
  required: ["stop_hook_active", "last_assistant_message"],
  meta: (p) => ({
    stop_hook_active: typeof p.stop_hook_active === "boolean" ? p.stop_hook_active : null,
    permission_mode: typeof p.permission_mode === "string" ? p.permission_mode : null,
    message_length: typeof p.last_assistant_message === "string" ? p.last_assistant_message.length : null,
  }),
  respond: () => ({}),
};
