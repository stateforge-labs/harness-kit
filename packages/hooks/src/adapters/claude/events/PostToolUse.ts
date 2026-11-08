import { z } from "zod";
import { common } from "../common.ts";
import { checkToolInput, anyToolInput, toolResponse } from "../tool-input.ts";
import { ClaudeHook } from "../names.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal(ClaudeHook.PostToolUse),
    tool_name: z.string(),
    tool_input: anyToolInput,
    tool_response: toolResponse,
    tool_use_id: z.string(),
    duration_ms: z.number().optional(),
  })
  .superRefine((v, ctx) => checkToolInput(v, ctx));
