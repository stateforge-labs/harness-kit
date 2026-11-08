import type { EventHandler } from "./types.ts";
import { ClaudeHook } from "../names.ts";

export const handler: EventHandler = {
  event: ClaudeHook.SessionEnd,
  meta: (p) => ({ reason: typeof p.reason === "string" ? p.reason : null }),
};
