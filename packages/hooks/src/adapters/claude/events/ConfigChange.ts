// ConfigChange: 6 real payloads from 2 captures (R-2026-11-07-05); judged spec: evidence/judged/ConfigChange.json
import { z } from "zod";
import { common } from "../common.ts";
import { ConfigChangeSource } from "../enums.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal("ConfigChange"),
    source: ConfigChangeSource,
    file_path: z.string().optional(),
  });
