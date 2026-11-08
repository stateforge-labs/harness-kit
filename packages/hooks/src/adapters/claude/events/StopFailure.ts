import { z } from "zod";
import { common } from "../common.ts";
import { StopFailureError } from "../enums.ts";
import { ClaudeHook } from "../names.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal(ClaudeHook.StopFailure),
    error_details: z.unknown().optional(),
    error: StopFailureError,
    last_assistant_message: z.string().optional(),
  });
