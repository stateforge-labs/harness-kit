// WorktreeRemove: http supported (docs list it with command and mcp_tool hooks). Passive: the server never blocks removal, and the response carries no fields for this event.
import type { EventHandler } from "./types.ts";

export const handler: EventHandler = {
  event: "WorktreeRemove",
  // Docs: WorktreeRemove input adds worktree_path only (absolute path, not logged).
  required: ["worktree_path"],
  // No meta candidates: the path is a filesystem location and is not logged.
  meta: () => ({}),
  // Passive. Response fields are not allowed for this event.
  respond: () => ({}),
};
