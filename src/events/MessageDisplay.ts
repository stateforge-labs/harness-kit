// MessageDisplay: display-only, http supported. Passive: displayContent is allowed by the spec but not used here.
import type { EventHandler } from "./types.ts";

const str = (v: unknown) => (typeof v === "string" ? v : null);

export const handler: EventHandler = {
  event: "MessageDisplay",
  required: ["turn_id", "message_id", "index", "final", "delta"],
  // Structural identifiers only. `delta` is assistant message text and is never logged.
  meta: (p) => ({
    index: typeof p.index === "number" ? p.index : null,
    final: typeof p.final === "boolean" ? p.final : null,
    message_id: str(p.message_id),
    turn_id: str(p.turn_id),
  }),
  respond: () => ({}),
};
