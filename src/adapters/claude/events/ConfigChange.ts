// ConfigChange: 6 real payloads from 2 captures (R-2026-11-07-05); judged spec: evidence/judged/ConfigChange.json
import { z } from "zod";
import { common } from "../common.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal("ConfigChange"),
    source: z.string(),  // seen so far (not exhaustive): local_settings, project_settings, skills, user_settings
    file_path: z.string().optional(),
  });
