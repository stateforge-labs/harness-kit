import type { EventHandler } from "./types.ts";
import { ClaudeHook } from "../names.ts";

export const handler: EventHandler = {
  event: ClaudeHook.ConfigChange,
  meta: (p) => ({ source: typeof p.source === "string" ? p.source : null }),
};
