import type { EventHandler } from "./types.ts";
import { ClaudeHook } from "../names.ts";

const str = (v: unknown) => (typeof v === "string" ? v : null);

export const handler: EventHandler = {
  event: ClaudeHook.PostModelSwitch,
  meta: (p) => ({
    source: str(p.source),
    from_model: str(p.from_model),
    to_model: str(p.to_model),
    requested_model: str(p.requested_model),
  }),
};
