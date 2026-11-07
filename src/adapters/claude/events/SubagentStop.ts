// SubagentStop: 21 real payloads from 12 captures (R-2026-11-07-05); judged spec: evidence/judged/SubagentStop.json
import { z } from "zod";
import { common } from "../common.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal("SubagentStop"),
    stop_hook_active: z.boolean(),
    agent_id: z.string(),
    agent_type: z.string(),
    agent_transcript_path: z.string(),
    last_assistant_message: z.string().optional(),  // seen in 20 of 21 payloads; judged required, but one capture lacked it
    background_tasks: z.array(z.unknown()).optional(),
    session_crons: z.array(z.unknown()).optional(),
  });
