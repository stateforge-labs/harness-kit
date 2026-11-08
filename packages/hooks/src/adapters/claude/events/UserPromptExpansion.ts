import { z } from "zod";
import { common } from "../common.ts";
import { CommandSource, ExpansionType } from "../enums.ts";
import { ClaudeHook } from "../names.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal(ClaudeHook.UserPromptExpansion),
    expansion_type: ExpansionType,
    command_name: z.string(),
    command_args: z.string(),
    command_source: CommandSource,
    prompt: z.string(),
  });
