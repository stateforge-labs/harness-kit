import { z } from "zod";
import { common } from "../common.ts";

export const schema = z.looseObject({
  ...common,
  agent: z.string(),
  id: z.string(),
  messageID: z.string(),
  tool: z.string(),
  input: z.unknown(),
});
