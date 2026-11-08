import type { EventHandler } from "./types.ts";
import { ClaudeHook } from "../names.ts";

export const handler: EventHandler = {
  event: ClaudeHook.WorktreeCreate,
  meta: (p) => ({ name: typeof p.name === "string" ? p.name : null }),
};
