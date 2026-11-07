// UserPromptExpansion: 7 real payloads from 7 captures (R-2026-11-07-05); judged spec: evidence/judged/UserPromptExpansion.json
import { z } from "zod";
import { common } from "../common.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal("UserPromptExpansion"),
    expansion_type: z.string(),  // seen so far (not exhaustive): slash_command
    command_name: z.string(),
    command_args: z.string(),
    command_source: z.string(),  // seen so far (not exhaustive): plugin, projectSettings
    prompt: z.string(),
  });
