// Passive: Notification hooks cannot block or change notifications, so this only logs. Not an http-hook-only event: http is supported per the judged contract.
// Observed (Notification-6, interactive permission_prompt): keys cwd, hook_event_name, message, notification_type, prompt_id, scratchpad_dir, session_id, transcript_path. No permission_mode, effort or tool_name.
import type { EventHandler } from "./types.ts";

export const handler: EventHandler = {
  event: "Notification",
  required: ["message", "notification_type"],
  meta: (p) => ({
    notification_type: typeof p.notification_type === "string" ? p.notification_type : null,
  }),
  respond: () => ({}),
};
