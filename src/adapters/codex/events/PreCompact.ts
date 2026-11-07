// PreCompact: pinned schema evidence/codex-primary/schemas/pre-compact.command.input.schema.json (hook_event_name const "PreCompact")
import { z } from "zod";
import { common } from "../common.ts";
import { CompactTrigger } from "../enums.ts";

export const schema = z.looseObject({
  ...common,
  // const "PreCompact" (see common.ts)
  agent_id: z.string().optional(),
  agent_type: z.string().optional(),
  model: z.string(),
  trigger: CompactTrigger,
  /** Codex extension: expose the active turn id to internal turn-scoped hooks. */
  turn_id: z.string(),
});
