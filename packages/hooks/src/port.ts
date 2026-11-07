// The port: what a harness adapter implements to plug into the server.
// A request is decode -> policy -> encode. Adapters own everything harness-specific (payload keys, validation,
// log metadata, response shapes); the core owns what to say. Nothing here may throw into the request path:
// the app wraps both calls and falls back to an empty answer.
import type { HarnessId, MetaValue, NeutralEvent } from "./core/event.ts";
import type { NeutralReply } from "./core/reply.ts";
import type { Rules } from "./core/policy.ts";

/** What an adapter makes of one raw payload. It only reports; it never rejects. */
export interface Decoded {
  /** Null when the adapter has no neutral reading: an unknown event, or none the policy applies to. */
  event: NeutralEvent | null;
  /** The adapter knows this event and has a schema for it. */
  known: boolean;
  /** Required keys that are absent, as dotted paths. */
  missing: string[];
  /** Keys with the wrong shape, as `path: expected <type>`. Paths and types only, never values. */
  wrong_type: string[];
  /** Non-sensitive scalars for the log. Never prompt text, tool input or tool output. */
  meta: Record<string, MetaValue>;
}

/** Fields every log line carries, read from the raw payload in the harness's own key names. */
export interface Common {
  event?: unknown;
  session_id?: unknown;
  agent_id?: unknown;
  agent_type?: unknown;
  tool_name?: unknown;
}

export interface HarnessAdapter {
  readonly id: HarnessId;
  readonly rules: Rules;
  decode(raw: Record<string, unknown>): Decoded;
  /** The body to send back for this reply. Applies the harness's per-event output rules. */
  encode(reply: NeutralReply, raw: Record<string, unknown>): unknown;
  /** Plain reads of the common fields; cannot throw. */
  common(raw: Record<string, unknown>): Common;
  /** JSON Schema per native event, for documentation and for the tests' required-key lists. */
  jsonSchemas(): Record<string, unknown>;
}
