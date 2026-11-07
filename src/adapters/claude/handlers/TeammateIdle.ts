import type { EventHandler } from "./types.ts";

// TeammateIdle fires when an agent-team teammate is about to go idle (seen in capture TeammateIdle-6).
// Supports the http hook type. Passive: it never blocks or stops a teammate, and always responds {}.
// team_name is documented as deprecated, so it is logged when present but never required.
export const handler: EventHandler = {
  event: "TeammateIdle",
  meta: (p) => ({
    teammate_name: typeof p.teammate_name === "string" ? p.teammate_name : null,
    team_name: typeof p.team_name === "string" ? p.team_name : null,
    agent_id: typeof p.agent_id === "string" ? p.agent_id : null,
    agent_type: typeof p.agent_type === "string" ? p.agent_type : null,
    permission_mode: typeof p.permission_mode === "string" ? p.permission_mode : null,
  }),
};
