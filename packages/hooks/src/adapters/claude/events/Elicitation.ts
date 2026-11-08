import { z } from "zod";
import { common } from "../common.ts";
import { ElicitationMode } from "../enums.ts";
import { ClaudeHook } from "../names.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal(ClaudeHook.Elicitation),
    mcp_server_name: z.string(),
    message: z.string(),
    elicitation_id: z.string().optional(),
    mode: ElicitationMode.optional(),
    requested_schema: z.record(z.string(), z.unknown()).optional(),
    url: z.string().optional(),
  });
