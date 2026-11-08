import { z } from "zod";
import { common } from "../common.ts";
import { PermissionMode } from "../enums.ts";

export const schema = z.looseObject({
  ...common,
  agent_id: z.string(),
  agent_type: z.string(),
  agent_transcript_path: z.string().nullable(),
  last_assistant_message: z.string().nullable(),
  model: z.string(),
  permission_mode: PermissionMode,
  stop_hook_active: z.boolean(),
  turn_id: z.string(),
});
