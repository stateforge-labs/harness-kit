import { z } from "zod";
import { common } from "../common.ts";
import { CompactTrigger } from "../enums.ts";
import { ClaudeHook } from "../names.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal(ClaudeHook.PreCompact),
    trigger: CompactTrigger,
    custom_instructions: z.string().nullable(),
  });
