import type { EventHandler } from "./types.ts";
import { CodexHook } from "../names.ts";

const str = (v: unknown) => (typeof v === "string" ? v : null);

export const handler: EventHandler = {
  event: CodexHook.SessionStart,
  meta: (p) => ({
    model: str(p.model),
    permission_mode: str(p.permission_mode),
    source: str(p.source),
  }),
};
