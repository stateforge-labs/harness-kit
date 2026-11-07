// TeammateIdle: 1 real payloads from 1 captures (R-2026-11-07-05); judged spec: evidence/judged/TeammateIdle.json
import { z } from "zod";
import { common } from "../common.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal("TeammateIdle"),
    teammate_name: z.string(),
    team_name: z.string().optional(),
  });
