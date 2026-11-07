import type { Pipeline } from "./core/pipeline.ts";
import type { Common, Decoded, HarnessAdapter } from "./port.ts";

export interface Handled {
  harness: string;
  body: unknown;
  decoded: Decoded;
  common: Common;
}

const UNKNOWN: Decoded = { event: null, known: false, missing: [], wrong_type: [], meta: {} };

/**
 * Run one payload through an adapter: decode, the middleware pipeline, encode. Whatever happens, the answer is a body:
 * a throw in decode makes the event unknown (still logged), and a throw in the pipeline or in encode makes the answer an empty object.
 */
export async function handle(adapter: HarnessAdapter, raw: Record<string, unknown>, pipeline: Pipeline): Promise<Handled> {
  const common = adapter.common(raw);
  let decoded = UNKNOWN;
  try {
    decoded = adapter.decode(raw);
  } catch (err) {
    console.error(`decode failed (${adapter.id}):`, err);
  }
  let body: unknown = {};
  try {
    const reply = decoded.event ? await pipeline.run({ event: decoded.event, rules: adapter.rules, raw }) : {};
    body = adapter.encode(reply, raw);
  } catch (err) {
    console.error(`pipeline or encode failed (${adapter.id}):`, err);
  }
  return { harness: adapter.id, body, decoded, common };
}
