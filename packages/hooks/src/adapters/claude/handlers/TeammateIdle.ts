import type { EventHandler } from "./types.ts";
import { ClaudeHook } from "../names.ts";

export const handler: EventHandler = {
  event: ClaudeHook.TeammateIdle,
  meta: (p) => ({
    teammate_name: typeof p.teammate_name === "string" ? p.teammate_name : null,
    team_name: typeof p.team_name === "string" ? p.team_name : null,
    agent_id: typeof p.agent_id === "string" ? p.agent_id : null,
    agent_type: typeof p.agent_type === "string" ? p.agent_type : null,
    permission_mode: typeof p.permission_mode === "string" ? p.permission_mode : null,
  }),
};
