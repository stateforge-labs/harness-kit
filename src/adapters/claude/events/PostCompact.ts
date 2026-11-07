// PostCompact: 3 real payloads from 3 captures (R-2026-11-07-05); judged spec: evidence/judged/PostCompact.json
import { z } from "zod";
import { common } from "../common.ts";
import { CompactTrigger } from "../enums.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal("PostCompact"),
    trigger: CompactTrigger,
    compact_summary: z.string(),
  });
