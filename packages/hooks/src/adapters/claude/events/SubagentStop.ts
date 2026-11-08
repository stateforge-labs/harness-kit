import { z } from "zod";
import { common } from "../common.ts";
import { ClaudeHook } from "../names.ts";

export const schema = z
  .looseObject({
    ...common,
    hook_event_name: z.literal(ClaudeHook.SubagentStop),
    stop_hook_active: z.boolean(),
    agent_id: z.string(),
    agent_type: z.string(),
    agent_transcript_path: z.string(),
    last_assistant_message: z.string().optional(),
    background_tasks: z.array(z.unknown()).optional(),
    session_crons: z.array(z.unknown()).optional(),
  });
