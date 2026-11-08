import { z } from "zod";
import { common } from "../common.ts";
import { checkToolInput, anyToolInput } from "../tool-input.ts";
import { ClaudeHook } from "../names.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal(ClaudeHook.PostToolUseFailure),
    tool_name: z.string(),
    tool_input: anyToolInput,
    tool_use_id: z.string(),
    error: z.string(),
    duration_ms: z.number().optional(),
    is_interrupt: z.boolean().optional(),
    mcp_server: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((v, ctx) => checkToolInput(v, ctx));
