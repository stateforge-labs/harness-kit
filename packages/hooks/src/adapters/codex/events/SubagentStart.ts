import { z } from "zod";
import { common } from "../common.ts";
import { PermissionMode } from "../enums.ts";

export const schema = z.looseObject({
  ...common,
  agent_id: z.string(),
  agent_type: z.string(),
  model: z.string(),
  permission_mode: PermissionMode,
  turn_id: z.string(),
});
