import { z } from "zod";

export const common = {
  hook_event_name: z.string(),
  session_id: z.string(),
  sessionID: z.string(),
};
