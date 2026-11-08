import type { EventHandler } from "./types.ts";
import { ClaudeHook } from "../names.ts";

export const handler: EventHandler = {
  event: ClaudeHook.WorktreeRemove,
  meta: () => ({}),
};
