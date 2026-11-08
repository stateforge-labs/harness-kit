import type { EventHandler } from "./types.ts";
import { CodexHook } from "../names.ts";

const str = (v: unknown) => (typeof v === "string" ? v : null);

export const handler: EventHandler = {
  event: CodexHook.PostCompact,
  meta: (p) => ({
    trigger: str(p.trigger),
  }),
};
