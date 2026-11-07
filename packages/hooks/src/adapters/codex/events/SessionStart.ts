// SessionStart: pinned schema evidence/codex-primary/schemas/session-start.command.input.schema.json (hook_event_name const "SessionStart")
import { z } from "zod";
import { common } from "../common.ts";
import { PermissionMode, SessionStartSource } from "../enums.ts";

export const schema = z.looseObject({
  ...common,
  // const "SessionStart" (see common.ts)
  model: z.string(),
  permission_mode: PermissionMode,
  source: SessionStartSource,
});
