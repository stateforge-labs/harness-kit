// PreModelSwitch: passive, never blocks or cancels a model switch (policy); http hook type is supported.
import type { EventHandler, MetaValue, HookPayload } from "./types.ts";

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);

export const handler: EventHandler = {
  event: "PreModelSwitch",
  required: [
    "from_model",
    "to_model",
    "requested_model",
    "source",
    "context_tokens",
    "prompt_cache_warm",
    "cache_ttl",
    "estimated_cache_write_usd",
    "pricing",
  ],
  meta: (p: HookPayload): Record<string, MetaValue> => ({
    source: str(p.source),
    from_model: str(p.from_model),
    to_model: str(p.to_model),
    requested_model: str(p.requested_model),
    prompt_cache_warm: bool(p.prompt_cache_warm),
    pricing: str(p.pricing),
  }),
  respond: () => ({}),
};
