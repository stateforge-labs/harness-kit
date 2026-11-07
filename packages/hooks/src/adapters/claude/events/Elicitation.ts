// Elicitation: 4 real payloads from 4 captures (R-2026-11-07-05); judged spec: evidence/judged/Elicitation.json
import { z } from "zod";
import { common } from "../common.ts";
import { ElicitationMode } from "../enums.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal("Elicitation"),
    mcp_server_name: z.string(),
    message: z.string(),
    elicitation_id: z.string().optional(),  // seen in 1 of 4 payloads
    mode: ElicitationMode.optional(),
    requested_schema: z.record(z.string(), z.unknown()).optional(),  // seen in 3 of 4 payloads
    url: z.string().optional(),  // seen in 1 of 4 payloads
  });
