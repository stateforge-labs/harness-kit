import { z } from "zod";
import { common } from "../common.ts";
import { ConfigChangeSource } from "../enums.ts";
import { ClaudeHook } from "../names.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal(ClaudeHook.ConfigChange),
    source: ConfigChangeSource,
    file_path: z.string().optional(),
  });
