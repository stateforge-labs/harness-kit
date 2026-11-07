// Interrupt: permission mode only.
import type { EventHandler } from "./types.ts";

const str = (v: unknown) => (typeof v === "string" ? v : null);

export const handler: EventHandler = {
  event: "Interrupt",
  meta: (p) => ({
    permission_mode: str(p.permission_mode),
  }),
};
