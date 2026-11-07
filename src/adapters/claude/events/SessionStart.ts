// SessionStart: 13 real payloads from 12 captures (R-2026-11-07-05); judged spec: evidence/judged/SessionStart.json
import { z } from "zod";
import { common } from "../common.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal("SessionStart"),
    // UNRESOLVED: source values compact and fork were never captured; model was absent in all 13 payloads
    model: z.string().optional(),
    source: z.string(),  // seen so far (not exhaustive): clear, resume, startup
    context_tokens: z.number().optional(),  // seen in 3 of 13 payloads
    estimated_cache_write_usd: z.number().optional(),  // seen in 3 of 13 payloads
    prompt_cache_likely_expired: z.boolean().optional(),  // seen in 3 of 13 payloads
    seconds_since_last_response: z.number().optional(),  // seen in 3 of 13 payloads
    session_title: z.string().optional(),  // seen in 1 of 13 payloads
  });
