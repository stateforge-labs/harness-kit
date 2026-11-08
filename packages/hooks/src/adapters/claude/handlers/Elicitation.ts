import type { EventHandler } from "./types.ts";
import { ClaudeHook } from "../names.ts";

export const handler: EventHandler = {
  event: ClaudeHook.Elicitation,
  meta: (p) => ({
    mcp_server_name: typeof p.mcp_server_name === "string" ? p.mcp_server_name : null,
    mode: typeof p.mode === "string" ? p.mode : null,
  }),
};
