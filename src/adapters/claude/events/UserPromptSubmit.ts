// UserPromptSubmit: 6 real payloads from 5 captures (R-2026-11-07-05); judged spec: evidence/judged/UserPromptSubmit.json
import { z } from "zod";
import { common } from "../common.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal("UserPromptSubmit"),
    prompt: z.string(),
  });
