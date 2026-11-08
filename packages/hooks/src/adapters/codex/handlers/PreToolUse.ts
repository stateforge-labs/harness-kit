import type { EventHandler } from "./types.ts";
import { CodexHook } from "../names.ts";

const str = (v: unknown) => (typeof v === "string" ? v : null);

export const handler: EventHandler = {
  event: CodexHook.PreToolUse,
  meta: (p) => ({
    tool_name: str(p.tool_name),
    permission_mode: str(p.permission_mode),
  }),
};
