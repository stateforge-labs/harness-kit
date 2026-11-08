import type { EventHandler } from "./types.ts";
import { ClaudeHook } from "../names.ts";

export const handler: EventHandler = {
  event: ClaudeHook.FileChanged,
  meta: (p) => ({ change: typeof p.event === "string" ? p.event : null }),
};
