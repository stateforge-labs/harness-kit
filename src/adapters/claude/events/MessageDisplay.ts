// MessageDisplay: 7 real payloads from 6 captures (R-2026-11-07-05); judged spec: evidence/judged/MessageDisplay.json
import { z } from "zod";
import { common } from "../common.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal("MessageDisplay"),
    turn_id: z.string(),
    message_id: z.string(),
    index: z.number(),
    final: z.boolean(),
    delta: z.string(),
  });
