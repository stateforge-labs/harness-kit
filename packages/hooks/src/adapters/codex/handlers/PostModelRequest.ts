// PostModelRequest: model, outcome and token counts. The error text is not logged, only whether there was one.
import type { EventHandler } from "./types.ts";

const str = (v: unknown) => (typeof v === "string" ? v : null);
const num = (v: unknown) => (typeof v === "number" ? v : null);
const usage = (p: Record<string, unknown>): Record<string, unknown> =>
  typeof p.token_usage === "object" && p.token_usage !== null ? (p.token_usage as Record<string, unknown>) : {};

export const handler: EventHandler = {
  event: "PostModelRequest",
  meta: (p) => ({
    model: str(p.model),
    status: str(p.status),
    has_error: p.error !== null && p.error !== undefined,
    input_tokens: num(usage(p).input_tokens),
    output_tokens: num(usage(p).output_tokens),
    total_tokens: num(usage(p).total_tokens),
  }),
};
