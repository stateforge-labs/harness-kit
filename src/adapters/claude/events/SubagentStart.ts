// SubagentStart: 15 real payloads from 14 captures (R-2026-11-07-05); judged spec: evidence/judged/SubagentStart.json
import { z } from "zod";
import { common } from "../common.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal("SubagentStart"),
    agent_id: z.string(),
    agent_type: z.string(),
  });
