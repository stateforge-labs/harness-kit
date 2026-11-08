import { z } from "zod";
import { common } from "../common.ts";
import { checkToolInput, anyToolInput } from "../tool-input.ts";
import { ClaudeHook } from "../names.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal(ClaudeHook.PermissionRequest),
    tool_name: z.string(),
    tool_input: anyToolInput,
    permission_suggestions: z.array(z.unknown()).optional(),
  })
  .superRefine((v, ctx) => checkToolInput(v, ctx));
