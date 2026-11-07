export interface HookPayload {
  hook_event_name?: string;
  session_id?: string;
  agent_id?: string;
  agent_type?: string;
  tool_name?: string;
  cwd?: string;
  [key: string]: unknown;
}

export type { MetaValue } from "../../../core/event.ts";
import type { MetaValue } from "../../../core/event.ts";

/** What the Claude adapter knows about one hook event beyond its schema: the log metadata. The answer is decided by the core policy and rendered by the adapter. Files in handlers/<Event>.ts export `handler`. */
export interface EventHandler {
  /** Exact hook_event_name this handler serves. */
  event: string;
  /** Non-sensitive scalars for the log line. Never prompt text, tool_input or tool_response. */
  meta(p: HookPayload): Record<string, MetaValue>;
}
