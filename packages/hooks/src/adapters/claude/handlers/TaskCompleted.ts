import type { EventHandler } from "./types.ts";
import { ClaudeHook } from "../names.ts";

const str = (v: unknown) => (typeof v === "string" ? v : null);

export const handler: EventHandler = {
  event: ClaudeHook.TaskCompleted,
  meta: (p) => ({
    teammate_name: str(p.teammate_name),
    agent_id: str(p.agent_id),
  }),
};
