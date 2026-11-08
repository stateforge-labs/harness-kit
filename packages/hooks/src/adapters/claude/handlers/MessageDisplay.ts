import type { EventHandler } from "./types.ts";
import { ClaudeHook } from "../names.ts";

const str = (v: unknown) => (typeof v === "string" ? v : null);

export const handler: EventHandler = {
  event: ClaudeHook.MessageDisplay,
  meta: (p) => ({
    index: typeof p.index === "number" ? p.index : null,
    final: typeof p.final === "boolean" ? p.final : null,
    message_id: str(p.message_id),
    turn_id: str(p.turn_id),
  }),
};
