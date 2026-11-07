// WorktreeCreate: 7 real payloads from 6 captures (R-2026-11-07-05); judged spec: evidence/judged/WorktreeCreate.json
import { z } from "zod";
import { common } from "../common.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal("WorktreeCreate"),
    name: z.string(),
  });
