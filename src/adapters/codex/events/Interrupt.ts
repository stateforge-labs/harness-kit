// Interrupt: pinned schema evidence/codex-primary/schemas/interrupt.command.input.schema.json (hook_event_name const "Interrupt")
import { z } from "zod";
import { common } from "../common.ts";

export const schema = z.looseObject({
  ...common,
  // const "Interrupt" (see common.ts)
  model: z.string(),
  // enum: default | acceptEdits | plan | dontAsk | bypassPermissions
  permission_mode: z.string(),
  /** Codex extension: expose the active turn id to internal turn-scoped hooks. */
  turn_id: z.string(),
});
