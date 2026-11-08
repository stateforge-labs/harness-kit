import { z } from "zod";
import { common } from "../common.ts";
import { PromptDelivery } from "../enums.ts";

export const schema = z.looseObject({
  ...common,
  messageID: z.string(),
  delivery: PromptDelivery,
  prompt: z.looseObject({ text: z.string(), files: z.array(z.unknown()).optional() }),
});
