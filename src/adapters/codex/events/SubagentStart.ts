// SubagentStart: pinned schema evidence/codex-primary/schemas/subagent-start.command.input.schema.json (hook_event_name const "SubagentStart")
import { z } from "zod";
import { common } from "../common.ts";

export const schema = z.looseObject({
  ...common,
  // const "SubagentStart" (see common.ts)
  // Tightened to required here (optional on other events): the schema lists both in "required".
  agent_id: z.string(),
  agent_type: z.string(),
  model: z.string(),
  // enum: default | acceptEdits | plan | dontAsk | bypassPermissions
  permission_mode: z.string(),
  /** Codex extension: expose the active turn id to internal turn-scoped hooks. */
  turn_id: z.string(),
});
