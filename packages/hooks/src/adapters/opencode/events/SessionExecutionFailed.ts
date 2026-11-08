import { z } from "zod";
import { common } from "../common.ts";

export const schema = z.looseObject({
  ...common,
  error: z.looseObject({ type: z.string(), message: z.string() }),
});
