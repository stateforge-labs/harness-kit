import type { EventHandler } from "./types.ts";

/**
 * PermissionDenied fires only in auto mode, after the classifier (or a safety check) denies a call.
 * Passive by policy: the handler never sets `retry` and never changes the denial. HTTP hooks are supported.
 */
export const handler: EventHandler = {
  event: "PermissionDenied",
  meta: (p) => ({
    tool_name: typeof p.tool_name === "string" ? p.tool_name : null,
    reason: typeof p.reason === "string" ? p.reason : null,
    permission_mode: typeof p.permission_mode === "string" ? p.permission_mode : null,
  }),
  respond: () => ({}),
};
