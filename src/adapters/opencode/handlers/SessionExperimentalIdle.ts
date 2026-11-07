// session.experimental.idle: labels and counts only. Never the prompt, a tool's input or output, or a resource.
import type { EventHandler } from "./types.ts";

export const handler: EventHandler = {
  event: "session.experimental.idle",
  meta: (p) => ({
    background_count: Array.isArray(p.background) ? p.background.length : null,
  }),
};
