// ElicitationResult: 5 real payloads from 5 captures (R-2026-11-07-05); judged spec: evidence/judged/ElicitationResult.json
import { z } from "zod";
import { common } from "../common.ts";
import { ElicitationAction, ElicitationMode } from "../enums.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal("ElicitationResult"),
    mcp_server_name: z.string(),
    action: ElicitationAction,
    elicitation_id: z.string().optional(),  // seen in 1 of 5 payloads
    mode: ElicitationMode.optional(),
  });
