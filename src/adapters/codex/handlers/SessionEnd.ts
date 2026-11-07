// SessionEnd: the reason only.
import type { EventHandler } from "./types.ts";

const str = (v: unknown) => (typeof v === "string" ? v : null);

export const handler: EventHandler = {
  event: "SessionEnd",
  meta: (p) => ({
    reason: str(p.reason),
  }),
};
