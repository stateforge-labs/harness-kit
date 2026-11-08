import type { EventHandler } from "./types.ts";
import { ClaudeHook } from "../names.ts";

export const handler: EventHandler = {
  event: ClaudeHook.Notification,
  meta: (p) => ({
    notification_type: typeof p.notification_type === "string" ? p.notification_type : null,
  }),
};
