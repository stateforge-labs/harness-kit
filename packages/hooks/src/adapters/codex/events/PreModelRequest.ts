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
