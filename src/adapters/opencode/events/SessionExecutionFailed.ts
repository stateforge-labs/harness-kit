// session.execution.failed: R-2026-11-07-08, opencode 2.2.6 (envelope only, see below)
import { z } from "zod";
import { common } from "../common.ts";

export const event = "session.execution.failed";

export const schema = z.looseObject({
  ...common,
  // UNRESOLVED: the error fields were never captured (no run failed); only the envelope is typed
});
