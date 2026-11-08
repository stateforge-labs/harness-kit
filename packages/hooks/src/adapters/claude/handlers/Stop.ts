import type { EventHandler } from "./types.ts";
import { ClaudeHook } from "../names.ts";

export const handler: EventHandler = {
  event: ClaudeHook.Stop,
  meta: (p) => ({
    stop_hook_active: typeof p.stop_hook_active === "boolean" ? p.stop_hook_active : null,
    permission_mode: typeof p.permission_mode === "string" ? p.permission_mode : null,
    message_length: typeof p.last_assistant_message === "string" ? p.last_assistant_message.length : null,
  }),
};
