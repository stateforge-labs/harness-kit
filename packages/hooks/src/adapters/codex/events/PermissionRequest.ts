import { z } from "zod";
import { common } from "../common.ts";
import { PermissionMode } from "../enums.ts";

export const schema = z.looseObject({
  ...common,
  agent_id: z.string().optional(),
  agent_type: z.string().optional(),
  model: z.string(),
  permission_mode: PermissionMode,
  tool_input: z.unknown(),
  tool_name: z.string(),
  turn_id: z.string(),
});
