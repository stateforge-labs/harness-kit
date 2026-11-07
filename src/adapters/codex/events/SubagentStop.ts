// SubagentStop: pinned schema evidence/codex-primary/schemas/subagent-stop.command.input.schema.json (hook_event_name const "SubagentStop")
import { z } from "zod";
import { common } from "../common.ts";

export const schema = z.looseObject({
  ...common,
  // const "SubagentStop" (see common.ts)
  // Tightened to required here (optional on other events): the schema lists these in "required".
  agent_id: z.string(),
  agent_type: z.string(),
  /** JSON Schema NullableString: required key, value may be null. */
  agent_transcript_path: z.string().nullable(),
  last_assistant_message: z.string().nullable(),
  model: z.string(),
  // enum: default | acceptEdits | plan | dontAsk | bypassPermissions
  permission_mode: z.string(),
  stop_hook_active: z.boolean(),
  /** Codex extension: expose the active turn id to internal turn-scoped hooks. */
  turn_id: z.string(),
});
