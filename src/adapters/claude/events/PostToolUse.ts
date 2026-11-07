// PostToolUse: 13 real payloads from 5 captures (R-2026-11-07-05); judged spec: evidence/judged/PostToolUse.json
import { z } from "zod";
import { common } from "../common.ts";
import { checkToolInput, anyToolInput, toolResponse } from "../tool-input.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal("PostToolUse"),
    tool_name: z.string(),
    tool_input: anyToolInput,
    tool_response: toolResponse,
    tool_use_id: z.string(),
    duration_ms: z.number().optional(),
  })
  .superRefine((v, ctx) => checkToolInput(v, ctx));
