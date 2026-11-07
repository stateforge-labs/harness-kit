import type { EventHandler } from "./types.ts";

// UserPromptSubmit: http supported. Passive by policy: always {}. Cannot replace the prompt; never blocks here.
export const handler: EventHandler = {
  event: "UserPromptSubmit",
  meta: (p) => ({
    permission_mode: typeof p.permission_mode === "string" ? p.permission_mode : null,
    agent_type: typeof p.agent_type === "string" ? p.agent_type : null,
    prompt_id: typeof p.prompt_id === "string" ? p.prompt_id : null,
    prompt_length: typeof p.prompt === "string" ? p.prompt.length : null,
  }),
};
