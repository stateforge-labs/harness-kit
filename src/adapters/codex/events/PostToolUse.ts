// PostToolUse: pinned schema evidence/codex-primary/schemas/post-tool-use.command.input.schema.json (hook_event_name const "PostToolUse")
import { z } from "zod";
import { common } from "../common.ts";
import { PermissionMode } from "../enums.ts";

export const schema = z.looseObject({
  ...common,
  // const "PostToolUse" (see common.ts)
  agent_id: z.string().optional(),
  agent_type: z.string().optional(),
  model: z.string(),
  permission_mode: PermissionMode,
  /** JSON Schema `true` (any value). Required key; value unconstrained. */
  tool_input: z.unknown(),
  tool_name: z.string(),
  /** JSON Schema `true` (any value). Required key; value unconstrained. */
  tool_response: z.unknown(),
  tool_use_id: z.string(),
  /** Codex extension: expose the active turn id to internal turn-scoped hooks. */
  turn_id: z.string(),
});
