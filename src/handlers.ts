import { hasSchema, validate } from "./adapters/claude/index.ts";
import { handlers } from "./events/index.ts";
import type { HookPayload, HookResponse, MetaValue } from "./events/types.ts";

export type { HookPayload, HookResponse };

export interface EventInfo {
  known: boolean;
  /** Required keys absent from the payload, as dotted paths. */
  missing: string[];
  /** Keys present with the wrong shape, as `path: expected <type>`. Never contains values. */
  wrong_type: string[];
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
  if (!h || !hasSchema(h.event)) return { known: false, missing: [], wrong_type: [], meta: {} };
  const v = validate(payload) ?? { missing: [], wrong_type: [] };
  return { known: true, missing: v.missing, wrong_type: v.wrong_type, meta: h.meta(payload) };
}
