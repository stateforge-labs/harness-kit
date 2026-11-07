// Elicitation: passive, never declines or answers an MCP input request; http hook type is supported.
import type { EventHandler } from "./types.ts";

export const handler: EventHandler = {
  event: "Elicitation",
  meta: (p) => ({
    mcp_server_name: typeof p.mcp_server_name === "string" ? p.mcp_server_name : null,
    mode: typeof p.mode === "string" ? p.mode : null,
  }),
};
