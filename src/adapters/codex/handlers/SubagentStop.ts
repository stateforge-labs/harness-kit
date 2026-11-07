// SubagentStop: agent type, permission mode and the stop-hook flag. Never the last message.
import type { EventHandler } from "./types.ts";

const str = (v: unknown) => (typeof v === "string" ? v : null);

export const handler: EventHandler = {
  event: "SubagentStop",
  meta: (p) => ({
    agent_type: str(p.agent_type),
    permission_mode: str(p.permission_mode),
    stop_hook_active: typeof p.stop_hook_active === "boolean" ? p.stop_hook_active : null,
  }),
};
