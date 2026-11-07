// permission.evaluate: R-2026-11-07-08, opencode 2.2.6
import { z } from "zod";
import { common } from "../common.ts";
import { PermissionEffect, PermissionSourceType } from "../enums.ts";

export const event = "permission.evaluate";

export const schema = z.looseObject({
  ...common,
  agent: z.string(),
  /** What is being asked for: shell, read, edit, subagent, ... (an open set of capability names). */
  action: z.string(),
  effect: PermissionEffect,
  /** The commands or paths the action touches. Never logged, only counted. */
  resources: z.array(z.string()),
  source: z.looseObject({ id: z.string(), messageID: z.string(), type: PermissionSourceType }),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
