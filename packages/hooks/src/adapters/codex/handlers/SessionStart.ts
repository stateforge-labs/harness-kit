// SessionStart: source (startup | compact seen), model and permission mode. No transcript path.
import type { EventHandler } from "./types.ts";

const str = (v: unknown) => (typeof v === "string" ? v : null);

export const handler: EventHandler = {
  event: "SessionStart",
  meta: (p) => ({
    model: str(p.model),
    permission_mode: str(p.permission_mode),
    source: str(p.source),
  }),
};
