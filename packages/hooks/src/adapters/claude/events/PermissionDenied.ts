// PermissionDenied: 1 real payloads from 1 captures (R-2026-11-07-05); judged spec: evidence/judged/PermissionDenied.json
import { z } from "zod";
import { common } from "../common.ts";
import { checkToolInput, anyToolInput } from "../tool-input.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal("PermissionDenied"),
    tool_name: z.string(),
    tool_input: anyToolInput,
    tool_use_id: z.string(),
    reason: z.string(),
  })
  .superRefine((v, ctx) => checkToolInput(v, ctx));
