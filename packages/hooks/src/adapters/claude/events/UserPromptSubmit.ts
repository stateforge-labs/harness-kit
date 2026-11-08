import { z } from "zod";
import { common } from "../common.ts";
import { ClaudeHook } from "../names.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal(ClaudeHook.UserPromptSubmit),
    prompt: z.string(),
  });
