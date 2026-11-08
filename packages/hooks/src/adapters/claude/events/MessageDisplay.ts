import { z } from "zod";
import { common } from "../common.ts";
import { ClaudeHook } from "../names.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal(ClaudeHook.MessageDisplay),
    turn_id: z.string(),
    message_id: z.string(),
    index: z.number(),
    final: z.boolean(),
    delta: z.string(),
  });
