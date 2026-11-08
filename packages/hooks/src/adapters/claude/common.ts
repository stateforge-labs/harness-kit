import { z } from "zod";
import { PermissionMode } from "./enums.ts";

export const common = {
  session_id: z.string(),
  transcript_path: z.string(),
  cwd: z.string(),
  hook_event_name: z.string(),
  prompt_id: z.string().optional(),
  scratchpad_dir: z.string().optional(),
  permission_mode: PermissionMode.optional(),
  effort: z.looseObject({ level: z.string() }).optional(),
  agent_id: z.string().optional(),
  agent_type: z.string().optional(),
};
