// CwdChanged: supports http hooks. Passive: no decision control. The handler replies {} and does not use
// watchPaths, systemMessage or terminalSequence; a hookSpecificOutput reply was not surfaced in captures (CwdChanged-3).
import type { EventHandler } from "./types.ts";

export const handler: EventHandler = {
  event: "CwdChanged",
  required: ["old_cwd", "new_cwd"],
  meta: () => ({}),
  respond: () => ({}),
};
