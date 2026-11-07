import { z } from "zod";

/**
 * Keys every body from clients/opencode/plugin.ts carries. `hook_event_name` and `session_id` are the plugin's envelope;
 * `sessionID` is OpenCode's own key, passed through untouched (hook arguments and event data both carry it).
 */
export const common = {
  /** The OpenCode hook name (`tool.execute.before`) or event type (`session.created`), set by the plugin. */
  hook_event_name: z.string(),
  /** A copy of `sessionID` made by the plugin, so every harness's body has the same session key. */
  session_id: z.string(),
  sessionID: z.string(),
};
