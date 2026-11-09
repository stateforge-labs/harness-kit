import type { Pipeline } from "./core/pipeline.ts";
import type { NeutralReply } from "./core/reply.ts";
import type { Common, Decoded, HarnessAdapter } from "./port.ts";

export interface Handled {
  harness: string;
  body: unknown;
  decoded: Decoded;
  common: Common;
}

export interface HandleOptions {
  onError?: (message: string, error: unknown) => void;
}

const UNKNOWN: Decoded = { event: null, known: false, missing: [], wrong_type: [], meta: {} };

export async function handle(
  adapter: HarnessAdapter,
  raw: Record<string, unknown>,
  pipeline: Pipeline,
  options: HandleOptions = {},
): Promise<Handled> {
  const onError = options.onError ?? (() => {});
  const common = adapter.common(raw);
  let decoded = UNKNOWN;
  let reply: NeutralReply = {};
  try {
    decoded = adapter.decode(raw);
    if (decoded.event) reply = await pipeline.run({ event: decoded.event, rules: adapter.rules, raw });
  } catch (err) {
    onError(`decode or pipeline failed (${adapter.id})`, err);
    const deny = pipeline.failClosed;
    reply = deny ? { deny } : {};
  }
  let body: unknown = {};
  try {
    body = adapter.encode(reply, raw);
  } catch (err) {
    onError(`encode failed (${adapter.id})`, err);
  }
  return { harness: adapter.id, body, decoded, common };
}
