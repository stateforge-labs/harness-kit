import type { EventHandler } from "./types.ts";
import { ClaudeHook } from "../names.ts";

export const handler: EventHandler = {
  event: ClaudeHook.SubagentStart,
  meta: (p) => ({ agent_type: typeof p.agent_type === "string" ? p.agent_type : null }),
};
