// StopFailure: 7 real payloads from 7 captures (R-2026-11-07-05); judged spec: evidence/judged/StopFailure.json
import { z } from "zod";
import { common } from "../common.ts";
import { StopFailureError } from "../enums.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal("StopFailure"),
    // UNRESOLVED: error_details was absent in all 7 payloads (format unknown), so it is accepted as anything
    error_details: z.unknown().optional(),
    error: StopFailureError,
    last_assistant_message: z.string().optional(),
  });
