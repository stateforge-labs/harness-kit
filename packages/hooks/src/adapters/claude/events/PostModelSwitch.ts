import { z } from "zod";
import { common } from "../common.ts";
import { CacheTtl, ModelSwitchSource } from "../enums.ts";
import { ClaudeHook } from "../names.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal(ClaudeHook.PostModelSwitch),
    from_model: z.string().nullable(),
    to_model: z.string(),
    requested_model: z.string(),
    source: ModelSwitchSource,
    context_tokens: z.number(),
    prompt_cache_warm: z.boolean(),
    cache_ttl: CacheTtl,
    estimated_cache_write_usd: z.number(),
    pricing: z.string(),
  });
