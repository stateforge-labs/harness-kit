// TaskCreated: 4 real payloads from 4 captures (R-2026-11-07-05); judged spec: evidence/judged/TaskCreated.json
import { z } from "zod";
import { common } from "../common.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal("TaskCreated"),
    task_id: z.string(),
    task_subject: z.string(),
    task_description: z.string().optional(),
  });
