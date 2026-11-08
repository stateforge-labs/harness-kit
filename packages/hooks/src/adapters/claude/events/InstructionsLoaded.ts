import { z } from "zod";
import { common } from "../common.ts";
import { InstructionsLoadReason, MemoryType } from "../enums.ts";
import { ClaudeHook } from "../names.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal(ClaudeHook.InstructionsLoaded),
    file_path: z.string(),
    memory_type: MemoryType,
    load_reason: InstructionsLoadReason,
    globs: z.array(z.unknown()).optional(),
    parent_file_path: z.string().optional(),
    trigger_file_path: z.string().optional(),
  });
