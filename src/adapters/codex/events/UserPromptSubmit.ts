// UserPromptSubmit: pinned schema evidence/codex-primary/schemas/user-prompt-submit.command.input.schema.json (hook_event_name const "UserPromptSubmit")
import { z } from "zod";
import { common } from "../common.ts";

export const schema = z.looseObject({
  ...common,
  // const "UserPromptSubmit" (see common.ts)
  agent_id: z.string().optional(),
  agent_type: z.string().optional(),
  model: z.string(),
  // enum: default | acceptEdits | plan | dontAsk | bypassPermissions
  permission_mode: z.string(),
  prompt: z.string(),
  /** Codex extension: expose the active turn id to internal turn-scoped hooks. */
  turn_id: z.string(),
});
