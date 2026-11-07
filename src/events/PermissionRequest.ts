// PermissionRequest: http supported. Passive: always {}, so the normal permission flow decides. Never allows, denies or edits input.
import type { EventHandler } from "./types.ts";

const str = (v: unknown) => (typeof v === "string" ? v : null);

export const handler: EventHandler = {
  event: "PermissionRequest",
  // Tool name and permission mode only. No tool_input, prompts, mcp_server or permission_suggestions.
  meta: (p) => ({
    tool_name: str(p.tool_name),
    permission_mode: str(p.permission_mode),
  }),
  respond: () => ({}),
};
