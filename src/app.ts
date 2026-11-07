import { policy } from "./core/policy.ts";
import type { Common, Decoded, HarnessAdapter } from "./port.ts";

export interface Handled {
  body: unknown;
  decoded: Decoded;
  common: Common;
}

const UNKNOWN: Decoded = { event: null, known: false, missing: [], wrong_type: [], meta: {} };

/**
 * Run one payload through an adapter: decode, decide, encode. Whatever the adapter does, the answer is a body:
 * a throw in decode makes the event unknown (still logged), and a throw in encode makes the answer an empty object.
 */
export function handle(adapter: HarnessAdapter, raw: Record<string, unknown>): Handled {
  const common = adapter.common(raw);
  let decoded = UNKNOWN;
  try {
    decoded = adapter.decode(raw);
  } catch (err) {
    console.error(`decode failed (${adapter.id}):`, err);
  }
  let body: unknown = {};
  try {
    body = adapter.encode(decoded.event ? policy(decoded.event, adapter.rules) : {}, raw);
  } catch (err) {
    console.error(`encode failed (${adapter.id}):`, err);
  }
  return { body, decoded, common };
}
