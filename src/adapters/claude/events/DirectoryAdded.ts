// DirectoryAdded: 5 real payloads from 3 captures (R-2026-11-07-05); judged spec: evidence/judged/DirectoryAdded.json
import { z } from "zod";
import { common } from "../common.ts";
import { DirectoryAddedSource } from "../enums.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal("DirectoryAdded"),
    directory: z.string(),
    source: DirectoryAddedSource,
  });
