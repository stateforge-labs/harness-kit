import { z } from "zod";
import { common } from "../common.ts";
import { checkToolInput, anyToolInput } from "../tool-input.ts";
import { ClaudeHook } from "../names.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal(ClaudeHook.PermissionDenied),
    tool_name: z.string(),
    tool_input: anyToolInput,
    tool_use_id: z.string(),
    reason: z.string(),
  })
  .superRefine((v, ctx) => checkToolInput(v, ctx));
