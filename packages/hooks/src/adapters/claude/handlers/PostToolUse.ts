import type { EventHandler } from "./types.ts";
import { ClaudeHook } from "../names.ts";

export const handler: EventHandler = {
  event: ClaudeHook.PostToolUse,
  meta: (p) => {
    const mcp = p.mcp_server;
    const mcpName = typeof mcp === "object" && mcp !== null && "name" in mcp && typeof mcp.name === "string" ? mcp.name : null;
    return {
      tool_name: typeof p.tool_name === "string" ? p.tool_name : null,
      duration_ms: typeof p.duration_ms === "number" ? p.duration_ms : null,
      permission_mode: typeof p.permission_mode === "string" ? p.permission_mode : null,
      mcp_server: mcpName,
      agent_type: typeof p.agent_type === "string" ? p.agent_type : null,
    };
  },
};
