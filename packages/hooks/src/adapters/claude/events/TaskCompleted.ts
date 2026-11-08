import { z } from "zod";
import { common } from "../common.ts";
import { ClaudeHook } from "../names.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal(ClaudeHook.TaskCompleted),
    task_id: z.string(),
    task_subject: z.string(),
    task_description: z.string().optional(),
  });
