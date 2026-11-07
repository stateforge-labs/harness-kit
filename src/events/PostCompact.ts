import type { EventHandler } from "./types.ts";

// PostCompact is http-capable. Passive: no decision control and no output fields are honoured, so respond is always {}.
export const handler: EventHandler = {
  event: "PostCompact",
  // trigger is observed as "manual" (PostCompact-2) and "auto" (PostCompact-4). An empty summary never reaches
  // this hook: the compaction fails first (PostCompact-5). compact_summary is conversation content and is never logged;
  // trigger is the only scalar kept.
  meta: (p) => ({ trigger: typeof p.trigger === "string" ? p.trigger : null }),
  respond: () => ({}),
};
