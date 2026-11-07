// FileChanged: 7 real payloads from 3 captures (R-2026-11-07-05); judged spec: evidence/judged/FileChanged.json
import { z } from "zod";
import { common } from "../common.ts";
import { FileChangeEvent } from "../enums.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal("FileChanged"),
    file_path: z.string(),
    event: FileChangeEvent,
  });
