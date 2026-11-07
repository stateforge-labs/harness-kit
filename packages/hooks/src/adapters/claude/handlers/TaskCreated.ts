// TaskCreated supports the http hook type in Claude Code. Its documented output is exit code 2 or top-level decision "block" (cancels the task; block observed in captures/TaskCreated-5). additionalContext is not a documented output for this event. This handler never blocks and always answers {}, so respond() is {}.
import type { EventHandler, HookPayload } from "./types.ts";

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

export const handler: EventHandler = {
  event: "TaskCreated",
  meta: (p: HookPayload) => ({
    task_id: str(p.task_id),
    teammate_name: str(p.teammate_name),
    agent_id: str(p.agent_id),
  }),
};
