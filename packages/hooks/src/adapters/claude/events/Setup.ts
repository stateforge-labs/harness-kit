import { z } from "zod";
import { common } from "../common.ts";
import { SetupTrigger } from "../enums.ts";
import { ClaudeHook } from "../names.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal(ClaudeHook.Setup),
    trigger: SetupTrigger,
  });
