import { z } from "zod";
import { common } from "../common.ts";
import { ElicitationAction, ElicitationMode } from "../enums.ts";
import { ClaudeHook } from "../names.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal(ClaudeHook.ElicitationResult),
    mcp_server_name: z.string(),
    action: ElicitationAction,
    elicitation_id: z.string().optional(),
    mode: ElicitationMode.optional(),
  });
