import type { EventHandler } from "./types.ts";

// PostCompact is http-capable. Passive: no decision control and no output fields are honoured, so respond is always {}.
export const handler: EventHandler = {
  event: "PostCompact",
  required: ["trigger", "compact_summary"],
  // compact_summary is conversation content and is never logged; trigger is the only scalar kept.
  meta: (p) => ({ trigger: typeof p.trigger === "string" ? p.trigger : null }),
  respond: () => ({}),
};
