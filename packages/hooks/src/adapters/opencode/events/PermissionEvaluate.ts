import { z } from "zod";
import { common } from "../common.ts";
import { PermissionEffect, PermissionSourceType } from "../enums.ts";

export const schema = z.looseObject({
  ...common,
  agent: z.string(),
  action: z.string(),
  effect: PermissionEffect,
  resources: z.array(z.string()),
  source: z.looseObject({ id: z.string(), messageID: z.string(), type: PermissionSourceType }),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
