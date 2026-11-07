// PreCompact: http supported. trigger is manual or auto (both captured). Captured: decision/reason can abort a manual compaction, but this handler stays passive and returns {}.
// HTTP JSON hookSpecificOutput is rejected for PreCompact, so no summary instructions can be injected here.
import type { EventHandler } from "./types.ts";

const str = (v: unknown) => (typeof v === "string" ? v : null);

export const handler: EventHandler = {
  event: "PreCompact",
  // Trigger only. custom_instructions is user-typed text and is never logged.
  meta: (p) => ({ trigger: str(p.trigger) }),
  respond: () => ({}),
};
