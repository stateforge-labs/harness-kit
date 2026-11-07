// Notification: 2 real payloads from 2 captures (R-2026-11-07-05); judged spec: evidence/judged/Notification.json
import { z } from "zod";
import { common } from "../common.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal("Notification"),
    message: z.string(),
    notification_type: z.string(),  // seen so far (not exhaustive): permission_prompt
  });
