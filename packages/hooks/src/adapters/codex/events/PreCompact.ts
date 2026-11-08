import { z } from "zod";
import { common } from "../common.ts";
import { CompactTrigger } from "../enums.ts";

export const schema = z.looseObject({
  ...common,
  agent_id: z.string().optional(),
  agent_type: z.string().optional(),
  model: z.string(),
  trigger: CompactTrigger,
  turn_id: z.string(),
});
