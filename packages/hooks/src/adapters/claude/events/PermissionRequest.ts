// PermissionRequest: 10 real payloads from 9 captures (R-2026-11-07-05); judged spec: evidence/judged/PermissionRequest.json
import { z } from "zod";
import { common } from "../common.ts";
import { checkToolInput, anyToolInput } from "../tool-input.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal("PermissionRequest"),
    tool_name: z.string(),
    tool_input: anyToolInput,
    permission_suggestions: z.array(z.unknown()).optional(),
  })
  .superRefine((v, ctx) => checkToolInput(v, ctx));
