import { z } from "zod";
import { common } from "../common.ts";
import { PermissionMode, SessionStartSource } from "../enums.ts";

export const schema = z.looseObject({
  ...common,
  model: z.string(),
  permission_mode: PermissionMode,
  source: SessionStartSource,
});
