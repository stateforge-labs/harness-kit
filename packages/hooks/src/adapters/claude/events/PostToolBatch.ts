import { z } from "zod";
import { common } from "../common.ts";
import { anyToolInput, checkToolInput, toolResponse } from "../tool-input.ts";
import { ClaudeHook } from "../names.ts";

const call = z
  .looseObject({
    tool_name: z.string(),
    tool_input: anyToolInput,
    tool_use_id: z.string(),
    tool_response: toolResponse,
  })
  .superRefine((v, ctx) => checkToolInput(v, ctx));

export const schema = z.looseObject({
  ...common,
  hook_event_name: z.literal(ClaudeHook.PostToolBatch),
  tool_calls: z.array(call),
});
