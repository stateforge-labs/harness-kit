// InstructionsLoaded: http supported. Passive observability only; the docs say the hook is async and discards all JSON output.
import type { EventHandler } from "./types.ts";

export const handler: EventHandler = {
  event: "InstructionsLoaded",
  meta: (p) => ({
    load_reason: typeof p.load_reason === "string" ? p.load_reason : null,
    memory_type: typeof p.memory_type === "string" ? p.memory_type : null,
  }),
  respond: () => ({}),
};
