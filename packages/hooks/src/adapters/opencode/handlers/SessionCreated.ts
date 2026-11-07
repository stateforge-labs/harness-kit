// session.created: labels and counts only. Never the prompt, a tool's input or output, or a resource.
import type { EventHandler } from "./types.ts";

export const handler: EventHandler = {
  event: "session.created",
  meta: (p) => ({
    is_child: typeof p.parentID === "string",
  }),
};
