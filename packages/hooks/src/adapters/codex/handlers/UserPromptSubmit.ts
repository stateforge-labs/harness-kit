// UserPromptSubmit: model and permission mode. Never the prompt.
import type { EventHandler } from "./types.ts";

const str = (v: unknown) => (typeof v === "string" ? v : null);

export const handler: EventHandler = {
  event: "UserPromptSubmit",
  meta: (p) => ({
    model: str(p.model),
    permission_mode: str(p.permission_mode),
  }),
};
