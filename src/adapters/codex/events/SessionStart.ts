// SessionStart: pinned schema evidence/codex-primary/schemas/session-start.command.input.schema.json (hook_event_name const "SessionStart")
import { z } from "zod";
import { common } from "../common.ts";

export const schema = z.looseObject({
  ...common,
  // const "SessionStart" (see common.ts)
  model: z.string(),
  // enum: default | acceptEdits | plan | dontAsk | bypassPermissions
  permission_mode: z.string(),
  // enum: startup | resume | clear | compact | fork
  source: z.string(),
});
