import { z } from "zod";
import { common } from "../common.ts";
import { SessionStartSource } from "../enums.ts";
import { ClaudeHook } from "../names.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal(ClaudeHook.SessionStart),
    model: z.string().optional(),
    source: SessionStartSource,
    context_tokens: z.number().optional(),
    estimated_cache_write_usd: z.number().optional(),
    prompt_cache_likely_expired: z.boolean().optional(),
    seconds_since_last_response: z.number().optional(),
    session_title: z.string().optional(),
  });
