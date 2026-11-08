import type { EventHandler, MetaValue, HookPayload } from "./types.ts";
import { ClaudeHook } from "../names.ts";

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);

export const handler: EventHandler = {
  event: ClaudeHook.PreModelSwitch,
  meta: (p: HookPayload): Record<string, MetaValue> => ({
    source: str(p.source),
    from_model: str(p.from_model),
    to_model: str(p.to_model),
    requested_model: str(p.requested_model),
    prompt_cache_warm: bool(p.prompt_cache_warm),
    pricing: str(p.pricing),
  }),
};
