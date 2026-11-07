// session.experimental.idle: R-2026-11-07-08, opencode 2.2.6
import { z } from "zod";
import { common } from "../common.ts";

export const event = "session.experimental.idle";

export const schema = z.looseObject({
  ...common,
  /** Background work still running when the session went idle. */
  background: z.array(z.unknown()),
});
