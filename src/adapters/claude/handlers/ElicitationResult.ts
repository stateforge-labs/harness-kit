import type { EventHandler, MetaValue } from "./types.ts";

// Passive: never overrides the user's accept/decline/cancel or its content, and never blocks.
// http hooks are supported for this event; the response is {} (no context or action override).
const scalar = (v: unknown): MetaValue | undefined =>
  typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v === null ? v : undefined;

export const handler: EventHandler = {
  event: "ElicitationResult",
  meta: (p) => {
    const out: Record<string, MetaValue> = {};
    for (const k of ["mcp_server_name", "action", "mode", "elicitation_id"]) {
      const v = scalar(p[k]);
      if (v !== undefined) out[k] = v;
    }
    return out;
  },
};
