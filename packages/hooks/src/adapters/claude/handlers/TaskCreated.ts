import type { EventHandler, HookPayload } from "./types.ts";
import { ClaudeHook } from "../names.ts";

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

export const handler: EventHandler = {
  event: ClaudeHook.TaskCreated,
  meta: (p: HookPayload) => ({
    task_id: str(p.task_id),
    teammate_name: str(p.teammate_name),
    agent_id: str(p.agent_id),
  }),
};
