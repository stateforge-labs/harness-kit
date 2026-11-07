// TaskCreated supports the http hook type in Claude Code. Passive: it never blocks or injects context (its docs list only decision/reason), so respond() is always {}.
import type { EventHandler, HookPayload } from "./types.ts";

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

export const handler: EventHandler = {
  event: "TaskCreated",
  required: ["task_id", "task_subject"],
  meta: (p: HookPayload) => ({
    task_id: str(p.task_id),
    teammate_name: str(p.teammate_name),
    agent_id: str(p.agent_id),
  }),
  respond: () => ({}),
};
