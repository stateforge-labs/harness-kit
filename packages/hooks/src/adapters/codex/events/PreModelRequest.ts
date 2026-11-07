// PreModelRequest: from the pinned schema evidence/codex-primary/schemas/model-request.command.input.schema.json (oneOf branch 1),
// and the real payloads in @homelab/harness-hooks fixtures/codex/PreModelRequest. No keys beyond the shared ones. No matcher support.
import { z } from "zod";
import { common } from "../common.ts";

const shared = {
  ...common,
  model: z.string(),
  turn_id: z.string(),
  agent_id: z.string().optional(),
  agent_type: z.string().optional(),
};

export const schema = z.looseObject({ ...shared });
