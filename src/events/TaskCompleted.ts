// TaskCompleted: http supported. Passive by policy: never blocks (no continue:false, exit-2 or decision), never injects context.
import type { EventHandler } from "./types.ts";

const str = (v: unknown) => (typeof v === "string" ? v : null);

export const handler: EventHandler = {
  event: "TaskCompleted",
  required: ["task_id", "task_subject"],
  // Teammate and agent identifiers only. No task_subject, task_description or team_name (deprecated).
  meta: (p) => ({
    teammate_name: str(p.teammate_name),
    agent_id: str(p.agent_id),
  }),
  respond: () => ({}),
};
