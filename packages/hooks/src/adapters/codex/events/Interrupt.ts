import { z } from "zod";
import { common } from "../common.ts";
import { PermissionMode } from "../enums.ts";

export const schema = z.looseObject({
  ...common,
  model: z.string(),
  permission_mode: PermissionMode,
  turn_id: z.string(),
});
