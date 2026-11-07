// Setup: 2 real payloads from 2 captures (R-2026-11-07-05); judged spec: evidence/judged/Setup.json
import { z } from "zod";
import { common } from "../common.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal("Setup"),
    trigger: z.string(),  // seen so far (not exhaustive): init, maintenance
  });
