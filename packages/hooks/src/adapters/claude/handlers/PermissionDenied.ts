import type { EventHandler } from "./types.ts";
import { ClaudeHook } from "../names.ts";

export const handler: EventHandler = {
  event: ClaudeHook.PermissionDenied,
  meta: (p) => ({
    tool_name: typeof p.tool_name === "string" ? p.tool_name : null,
    reason: typeof p.reason === "string" ? p.reason : null,
    permission_mode: typeof p.permission_mode === "string" ? p.permission_mode : null,
  }),
};
