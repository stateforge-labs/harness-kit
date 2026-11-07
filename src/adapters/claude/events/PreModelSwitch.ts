// PreModelSwitch: 4 real payloads from 3 captures (R-2026-11-07-05); judged spec: evidence/judged/PreModelSwitch.json
import { z } from "zod";
import { common } from "../common.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal("PreModelSwitch"),
    // UNRESOLVED: whether from_model can be null (always a string in the captures); allowed so it never logs as wrong_type
    from_model: z.string().nullable(),
    to_model: z.string(),
    requested_model: z.string(),
    source: z.string(),  // seen so far (not exhaustive): command
    context_tokens: z.number(),
    prompt_cache_warm: z.boolean(),
    cache_ttl: z.string(),  // seen so far (not exhaustive): 1h
    estimated_cache_write_usd: z.number(),
    pricing: z.string(),
  });
