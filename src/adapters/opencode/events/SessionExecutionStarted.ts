// session.execution.started: R-2026-11-07-08, opencode 2.2.6
import { z } from "zod";
import { common } from "../common.ts";

export const event = "session.execution.started";

export const schema = z.looseObject({
  ...common,
});
