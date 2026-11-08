import { z } from "zod";

export const common = {
  cwd: z.string(),
  hook_event_name: z.string(),
  session_id: z.string(),
  transcript_path: z.string().nullable(),
};
