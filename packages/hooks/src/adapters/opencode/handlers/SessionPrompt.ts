// session.prompt: labels and counts only. Never the prompt, a tool's input or output, or a resource.
import type { EventHandler } from "./types.ts";

const str = (v: unknown) => (typeof v === "string" ? v : null);

export const handler: EventHandler = {
  event: "session.prompt",
  meta: (p) => ({
    delivery: str(p.delivery),
  }),
};
