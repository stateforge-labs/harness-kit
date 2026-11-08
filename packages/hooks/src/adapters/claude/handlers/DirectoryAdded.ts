import type { EventHandler } from "./types.ts";
import { ClaudeHook } from "../names.ts";

const str = (v: unknown) => (typeof v === "string" ? v : null);

export const handler: EventHandler = {
  event: ClaudeHook.DirectoryAdded,
  meta: (p) => ({ source: str(p.source) }),
};
