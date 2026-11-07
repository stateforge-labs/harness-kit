import { handlers } from "./events/index.ts";
import type { HookPayload, HookResponse, MetaValue } from "./events/types.ts";

export type { HookPayload, HookResponse };

export interface EventInfo {
  known: boolean;
  /** Required event-specific keys absent from the payload. */
  missing: string[];
  meta: Record<string, MetaValue>;
}

/** Turn one hook event into the JSON Claude Code expects back. Unknown events get `{}`. */
export function handle(payload: HookPayload): HookResponse {
  const event = payload.hook_event_name;
  if (!event) return {};
  return handlers.get(event)?.respond(payload) ?? {};
}

/** What the log records about an event beyond the common metadata. */
export function describe(payload: HookPayload): EventInfo {
  const h = payload.hook_event_name ? handlers.get(payload.hook_event_name) : undefined;
  if (!h) return { known: false, missing: [], meta: {} };
  return { known: true, missing: h.required.filter((k) => !(k in payload)), meta: h.meta(payload) };
}
