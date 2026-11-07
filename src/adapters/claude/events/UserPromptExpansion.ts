// UserPromptExpansion: 7 real payloads from 7 captures (R-2026-11-07-05); judged spec: evidence/judged/UserPromptExpansion.json
import { z } from "zod";
import { common } from "../common.ts";
import { CommandSource, ExpansionType } from "../enums.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal("UserPromptExpansion"),
    expansion_type: ExpansionType,
    command_name: z.string(),
    command_args: z.string(),
    command_source: CommandSource,
    prompt: z.string(),
  });
