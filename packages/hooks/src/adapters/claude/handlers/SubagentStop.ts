import type { EventHandler } from "./types.ts";
import { ClaudeHook } from "../names.ts";

export const handler: EventHandler = {
  event: ClaudeHook.SubagentStop,
  meta: (p) => {
    const effort = typeof p.effort === "object" && p.effort !== null && "level" in p.effort ? p.effort.level : null;
    return {
      agent_type: typeof p.agent_type === "string" ? p.agent_type : null,
      agent_id: typeof p.agent_id === "string" ? p.agent_id : null,
      stop_hook_active: typeof p.stop_hook_active === "boolean" ? p.stop_hook_active : null,
      permission_mode: typeof p.permission_mode === "string" ? p.permission_mode : null,
      effort_level: typeof effort === "string" ? effort : null,
    };
  },
};
