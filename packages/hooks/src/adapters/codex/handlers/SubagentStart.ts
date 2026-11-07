// SubagentStart: agent type and permission mode.
import type { EventHandler } from "./types.ts";

const str = (v: unknown) => (typeof v === "string" ? v : null);

export const handler: EventHandler = {
  event: "SubagentStart",
  meta: (p) => ({
    agent_type: str(p.agent_type),
    permission_mode: str(p.permission_mode),
  }),
};
