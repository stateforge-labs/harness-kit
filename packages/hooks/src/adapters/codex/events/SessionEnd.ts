import { z } from "zod";
import { common } from "../common.ts";

export const schema = z.looseObject({
  ...common,
  reason: z.string(),
});
