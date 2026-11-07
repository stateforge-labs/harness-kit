// PreModelRequest: model only.
import type { EventHandler } from "./types.ts";

const str = (v: unknown) => (typeof v === "string" ? v : null);

export const handler: EventHandler = {
  event: "PreModelRequest",
  meta: (p) => ({
    model: str(p.model),
  }),
};
