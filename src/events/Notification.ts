// Passive: Notification hooks cannot block or change notifications, so this only logs. Not an http-hook-only event: http is supported per the judged contract.
import type { EventHandler } from "./types.ts";

export const handler: EventHandler = {
  event: "Notification",
  required: ["message", "notification_type"],
  meta: (p) => ({
    notification_type: typeof p.notification_type === "string" ? p.notification_type : null,
  }),
  respond: () => ({}),
};
