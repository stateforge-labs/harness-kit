// PreToolUse: tool name and permission mode. Never tool_input (it holds the command).
import type { EventHandler } from "./types.ts";

const str = (v: unknown) => (typeof v === "string" ? v : null);

export const handler: EventHandler = {
  event: "PreToolUse",
  meta: (p) => ({
    tool_name: str(p.tool_name),
    permission_mode: str(p.permission_mode),
  }),
};
