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

export interface NeutralEvent {
  harness: HarnessId;
  kind: NeutralKind;
  /** The event's name in the harness's own words, for logs. */
  native: string;
  /** Set on a pre-tool event whose tool starts a subagent. A spawn is still a pre-tool event. */
  spawn?: Spawn;
}
