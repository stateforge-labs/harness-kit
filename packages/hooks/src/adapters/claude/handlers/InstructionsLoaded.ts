import type { EventHandler } from "./types.ts";
import { ClaudeHook } from "../names.ts";

export const handler: EventHandler = {
  event: ClaudeHook.InstructionsLoaded,
  meta: (p) => ({
    load_reason: typeof p.load_reason === "string" ? p.load_reason : null,
    memory_type: typeof p.memory_type === "string" ? p.memory_type : null,
  }),
};
