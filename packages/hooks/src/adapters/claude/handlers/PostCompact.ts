import type { EventHandler } from "./types.ts";
import { ClaudeHook } from "../names.ts";

export const handler: EventHandler = {
  event: ClaudeHook.PostCompact,
  meta: (p) => ({ trigger: typeof p.trigger === "string" ? p.trigger : null }),
};
