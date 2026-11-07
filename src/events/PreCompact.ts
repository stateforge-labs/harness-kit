// PreCompact: http supported. Passive: never blocks (decision/reason are not used) and injects nothing; returns {}.
import type { EventHandler } from "./types.ts";

const str = (v: unknown) => (typeof v === "string" ? v : null);

export const handler: EventHandler = {
  event: "PreCompact",
  required: ["trigger", "custom_instructions"],
  // Trigger only. custom_instructions is user-typed text and is never logged.
  meta: (p) => ({ trigger: str(p.trigger) }),
  respond: () => ({}),
};
