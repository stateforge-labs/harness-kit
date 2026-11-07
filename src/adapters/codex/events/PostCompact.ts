// PostCompact: pinned schema evidence/codex-primary/schemas/post-compact.command.input.schema.json (hook_event_name const "PostCompact")
import { z } from "zod";
import { common } from "../common.ts";

export const schema = z.looseObject({
  ...common,
  // const "PostCompact" (see common.ts)
  agent_id: z.string().optional(),
  agent_type: z.string().optional(),
  model: z.string(),
  // enum: manual | auto
  trigger: z.string(),
  /** Codex extension: expose the active turn id to internal turn-scoped hooks. */
  turn_id: z.string(),
});
