export interface HookPayload {
  hook_event_name?: string;
  session_id?: string;
  agent_id?: string;
  agent_type?: string;
  tool_name?: string;
  cwd?: string;
  [key: string]: unknown;
}

export type HookResponse = Record<string, unknown>;
export type MetaValue = string | number | boolean | null;

/** One handler per Claude Code hook event. Files in src/events/<Event>.ts export `handler`. */
export interface EventHandler {
  /** Exact hook_event_name this handler serves. */
  event: string;
  /** Event-specific payload keys the spec says are always present (common fields excluded). */
  required: readonly string[];
  /** Non-sensitive scalars for the log line. Never prompt text, tool_input or tool_response. */
  meta(p: HookPayload): Record<string, MetaValue>;
  /** JSON body returned to Claude Code. Only fields the spec allows for this event. */
  respond(p: HookPayload): HookResponse;
}
