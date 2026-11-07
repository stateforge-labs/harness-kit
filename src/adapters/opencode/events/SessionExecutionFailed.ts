// session.execution.failed: R-2026-11-07-08, opencode 2.2.6 (capture "bad-model": a model that does not exist)
import { z } from "zod";
import { common } from "../common.ts";

export const event = "session.execution.failed";

export const schema = z.looseObject({
  ...common,
  /** { type, message }: type was `provider.no-route` for an unknown model; other failure types were never captured. Never logged. */
  error: z.looseObject({ type: z.string(), message: z.string() }),
});
