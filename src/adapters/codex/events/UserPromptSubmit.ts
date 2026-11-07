// UserPromptSubmit: pinned schema evidence/codex-primary/schemas/user-prompt-submit.command.input.schema.json (hook_event_name const "UserPromptSubmit")
import { z } from "zod";
import { common } from "../common.ts";
import { PermissionMode } from "../enums.ts";

export const schema = z.looseObject({
  ...common,
  // const "UserPromptSubmit" (see common.ts)
  agent_id: z.string().optional(),
  agent_type: z.string().optional(),
  model: z.string(),
  permission_mode: PermissionMode,
  prompt: z.string(),
  /** Codex extension: expose the active turn id to internal turn-scoped hooks. */
  turn_id: z.string(),
});
