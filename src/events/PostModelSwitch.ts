// PostModelSwitch: http supported. Passive: the model already changed, so it can't block and no context is injected.
import type { EventHandler } from "./types.ts";

const str = (v: unknown) => (typeof v === "string" ? v : null);

export const handler: EventHandler = {
  event: "PostModelSwitch",
  required: ["from_model", "to_model", "requested_model", "source"],
  // Model names and the switch source only. Cost fields and pricing are not logged.
  meta: (p) => ({
    source: str(p.source),
    from_model: str(p.from_model),
    to_model: str(p.to_model),
    requested_model: str(p.requested_model),
  }),
  respond: () => ({}),
};
