// session.compaction.ended: labels and counts only. Never the prompt, a tool's input or output, or a resource.
import type { EventHandler } from "./types.ts";

export const handler: EventHandler = {
  event: "session.compaction.ended",
  meta: () => ({}),
};
