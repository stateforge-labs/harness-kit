import { z } from "zod";
import { common } from "../common.ts";
import { InterruptReason } from "../enums.ts";

export const schema = z.looseObject({
  ...common,
  reason: InterruptReason,
});
