// Stop: pinned schema evidence/codex-primary/schemas/stop.command.input.schema.json (hook_event_name const "Stop")
import { z } from "zod";
import { common } from "../common.ts";

export const schema = z.looseObject({
  ...common,
  // const "Stop" (see common.ts)
  /** JSON Schema NullableString: required key, value may be null. */
  last_assistant_message: z.string().nullable(),
  model: z.string(),
  // enum: default | acceptEdits | plan | dontAsk | bypassPermissions
  permission_mode: z.string(),
  stop_hook_active: z.boolean(),
  /** Codex extension: expose the active turn id to internal turn-scoped hooks. */
  turn_id: z.string(),
});
