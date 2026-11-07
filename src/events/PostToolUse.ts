import type { EventHandler } from "./types.ts";

/**
 * PostToolUse fires after a tool succeeds. Passive by policy: it never blocks, never adds context and never
 * changes the tool output (no updatedToolOutput, decision or continue). HTTP hooks are supported.
 */
export const handler: EventHandler = {
  event: "PostToolUse",
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
  respond: () => ({}),
};
