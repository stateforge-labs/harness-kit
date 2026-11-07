// CwdChanged: 4 real payloads from 3 captures (R-2026-11-07-05); judged spec: evidence/judged/CwdChanged.json
import { z } from "zod";
import { common } from "../common.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal("CwdChanged"),
    old_cwd: z.string(),
    new_cwd: z.string(),
  });
