// PreCompact: 12 real payloads from 10 captures (R-2026-11-07-05); judged spec: evidence/judged/PreCompact.json
import { z } from "zod";
import { common } from "../common.ts";
import { CompactTrigger } from "../enums.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal("PreCompact"),
    trigger: CompactTrigger,
    custom_instructions: z.string().nullable(),
  });
