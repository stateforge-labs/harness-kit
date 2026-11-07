// InstructionsLoaded: 10 real payloads from 3 captures (R-2026-11-07-05); judged spec: evidence/judged/InstructionsLoaded.json
import { z } from "zod";
import { common } from "../common.ts";
import { InstructionsLoadReason, MemoryType } from "../enums.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal("InstructionsLoaded"),
    file_path: z.string(),
    memory_type: MemoryType,
    load_reason: InstructionsLoadReason,
    globs: z.array(z.unknown()).optional(),  // seen in 1 of 10 payloads
    parent_file_path: z.string().optional(),  // seen in 4 of 10 payloads
    trigger_file_path: z.string().optional(),  // seen in 2 of 10 payloads
  });
