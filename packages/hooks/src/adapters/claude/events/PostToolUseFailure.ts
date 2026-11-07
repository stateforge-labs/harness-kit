// PostToolUseFailure: 7 real payloads from 5 captures (R-2026-11-07-05); judged spec: evidence/judged/PostToolUseFailure.json
import { z } from "zod";
import { common } from "../common.ts";
import { checkToolInput, anyToolInput } from "../tool-input.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal("PostToolUseFailure"),
    tool_name: z.string(),
    tool_input: anyToolInput,
    tool_use_id: z.string(),
    error: z.string(),
    duration_ms: z.number().optional(),
    is_interrupt: z.boolean().optional(),
    mcp_server: z.record(z.string(), z.unknown()).optional(),  // seen in 2 of 7 payloads
  })
  .superRefine((v, ctx) => checkToolInput(v, ctx));
