// session.execution.interrupted: R-2026-11-07-08, opencode 2.2.6
import { z } from "zod";
import { common } from "../common.ts";
import { InterruptReason } from "../enums.ts";

export const event = "session.execution.interrupted";

export const schema = z.looseObject({
  ...common,
  reason: InterruptReason,
});
