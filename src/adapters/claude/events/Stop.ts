// Stop: 9 real payloads from 5 captures (R-2026-11-07-05); judged spec: evidence/judged/Stop.json
import { z } from "zod";
import { common } from "../common.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal("Stop"),
    stop_hook_active: z.boolean(),
    background_tasks: z.array(z.unknown()).optional(),
    last_assistant_message: z.string().optional(),  // seen in 8 of 9 payloads
    session_crons: z.array(z.unknown()).optional(),
  });
