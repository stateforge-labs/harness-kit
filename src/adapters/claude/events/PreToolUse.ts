// PreToolUse: 28 real payloads from 16 captures (R-2026-11-07-05); judged spec: evidence/judged/PreToolUse.json
import { z } from "zod";
import { common } from "../common.ts";
import { checkToolInput, anyToolInput } from "../tool-input.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal("PreToolUse"),
    tool_name: z.string(),
    tool_input: anyToolInput,
    tool_use_id: z.string(),
  })
  .superRefine((v, ctx) => checkToolInput(v, ctx));
