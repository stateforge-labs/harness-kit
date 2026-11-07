// CwdChanged: supports http hooks. Passive: no decision control; watchPaths and systemMessage are not used here.
import type { EventHandler } from "./types.ts";

export const handler: EventHandler = {
  event: "CwdChanged",
  required: ["old_cwd", "new_cwd"],
  meta: () => ({}),
  respond: () => ({}),
};
