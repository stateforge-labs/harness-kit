// The harness-neutral event. Adapters turn what a harness sends into one of these; policy reads only this.
// Nothing in src/core knows a harness name's wire format, a payload key or a response shape.

export type HarnessId = "claude" | "codex" | "opencode";
export type MetaValue = string | number | boolean | null;

/** What happened, in terms every harness shares. A native event with no shared meaning is "other". */
export type NeutralKind =
  | "session-start"
  | "session-end"
  | "prompt-submit"
  | "pre-tool"
  | "post-tool"
  | "post-tool-failure"
  | "permission-request"
  | "subagent-start"
  | "subagent-stop"
  | "stop"
  | "pre-compact"
  | "post-compact"
  | "other";

/** A tool call that starts a subagent: the brief it is given and the model it asks for, if any. */
export interface Spawn {
  brief: string;
  model: string | null;
}

/**
 * The tool a tool event is about. `callId` is the harness's id for this one call, or null when the payload has none:
 * Claude Code and Codex send `tool_use_id` (on Codex it equals the MCP `_meta.callId`, R-2026-11-07-10 F17); OpenCode sends `id`,
 * the model's tool-call id, which never reaches an MCP server, and calls made inside codemode's `execute` share the outer call's id.
 */
export interface ToolRef {
  name: string;
  callId: string | null;
}

export interface NeutralEvent {
  harness: HarnessId;
  kind: NeutralKind;
  /** The event's name in the harness's own words, for logs. */
  native: string;
  /** The harness's session id, or null when the payload has none. */
  session: string | null;
  /** Set on pre-tool, post-tool, post-tool-failure and permission-request events whose payload names the tool. */
  tool?: ToolRef;
  /** Set on a pre-tool event whose tool starts a subagent. A spawn is still a pre-tool event. */
  spawn?: Spawn;
}
