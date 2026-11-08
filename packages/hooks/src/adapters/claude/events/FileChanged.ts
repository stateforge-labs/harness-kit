import { z } from "zod";
import { common } from "../common.ts";
import { FileChangeEvent } from "../enums.ts";
import { ClaudeHook } from "../names.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal(ClaudeHook.FileChanged),
    file_path: z.string(),
    event: FileChangeEvent,
  });
