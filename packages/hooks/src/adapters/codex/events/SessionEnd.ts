// SessionEnd: pinned schema evidence/codex-primary/schemas/session-end.command.input.schema.json (hook_event_name const "SessionEnd")
import { z } from "zod";
import { common } from "../common.ts";

export const schema = z.looseObject({
  ...common,
  // const "SessionEnd" (see common.ts)
  // const "other" in the pinned schema; the only reason seen. Typed as string, not a literal.
  reason: z.string(),
});
