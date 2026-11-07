// session.prompt: R-2026-11-07-08, opencode 2.2.6
import { z } from "zod";
import { common } from "../common.ts";
import { PromptDelivery } from "../enums.ts";

export const event = "session.prompt";

export const schema = z.looseObject({
  ...common,
  messageID: z.string(),
  delivery: PromptDelivery,
  /** The user's text and any attached files. Never logged. */
  prompt: z.looseObject({ text: z.string(), files: z.array(z.unknown()).optional() }),
});
