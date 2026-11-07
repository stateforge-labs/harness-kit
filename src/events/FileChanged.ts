// FileChanged: passive. Claude Code runs it after a watched file changes; it cannot block, and only watchPaths/systemMessage are read from output (not used here). http supported.
import type { EventHandler } from "./types.ts";

export const handler: EventHandler = {
  event: "FileChanged",
  required: ["file_path", "event"],
  // Not named "event": the log line already has an `event` field (the hook name), and meta is spread over it.
  meta: (p) => ({ change: typeof p.event === "string" ? p.event : null }),
  respond: () => ({}),
};
