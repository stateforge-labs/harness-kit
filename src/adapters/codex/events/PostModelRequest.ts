// PostModelRequest: from the pinned schema evidence/codex-primary/schemas/model-request.command.input.schema.json (oneOf branch 2),
// and the real payloads in test/fixtures/codex/PostModelRequest. No matcher support.
import { z } from "zod";
import { common } from "../common.ts";
import { ModelRequestStatus } from "../enums.ts";

const tokenUsage = z.looseObject({
  /** Not in "required"; JSON Schema default 0. */
  cache_write_input_tokens: z.number().int().optional(),
  cached_input_tokens: z.number().int(),
  input_tokens: z.number().int(),
  output_tokens: z.number().int(),
  reasoning_output_tokens: z.number().int(),
  total_tokens: z.number().int(),
});

export const schema = z.looseObject({
  ...common,
  model: z.string(),
  turn_id: z.string(),
  agent_id: z.string().optional(),
  agent_type: z.string().optional(),
  error: z.string().nullable(),
  status: ModelRequestStatus,
  token_usage: tokenUsage.nullable(),
});
