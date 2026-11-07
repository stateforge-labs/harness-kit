// PostCompact: what triggered the compaction (auto seen).
import type { EventHandler } from "./types.ts";

const str = (v: unknown) => (typeof v === "string" ? v : null);

export const handler: EventHandler = {
  event: "PostCompact",
  meta: (p) => ({
    trigger: str(p.trigger),
  }),
};
