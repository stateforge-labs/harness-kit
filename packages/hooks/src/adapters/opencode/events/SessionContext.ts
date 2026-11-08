import { z } from "zod";
import { common } from "../common.ts";

export const schema = z.looseObject({
  ...common,
  agent: z.string(),
  parentID: z.string().optional(),
  model: z.looseObject({ id: z.string(), providerID: z.string() }),
});
