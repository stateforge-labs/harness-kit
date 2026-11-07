// session.execution.failed: the failure type only (a label such as provider.no-route). Never the message.
import type { EventHandler } from "./types.ts";

export const handler: EventHandler = {
  event: "session.execution.failed",
  meta: (p) => ({
    error_type: typeof p.error === "object" && p.error !== null && typeof (p.error as Record<string, unknown>).type === "string" ? ((p.error as Record<string, unknown>).type as string) : null,
  }),
};
