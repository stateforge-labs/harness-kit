import { z } from "zod";
import { common } from "../common.ts";
import { ClaudeHook } from "../names.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal(ClaudeHook.Stop),
    stop_hook_active: z.boolean(),
    background_tasks: z.array(z.unknown()).optional(),
    last_assistant_message: z.string().optional(),
    session_crons: z.array(z.unknown()).optional(),
  });
