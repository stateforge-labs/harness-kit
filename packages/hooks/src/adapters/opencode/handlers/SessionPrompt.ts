import type { EventHandler } from "./types.ts";
import { OpenCodeHook } from "../names.ts";

const str = (v: unknown) => (typeof v === "string" ? v : null);

export const handler: EventHandler = {
  event: OpenCodeHook.SessionPrompt,
  meta: (p) => ({
    delivery: str(p.delivery),
  }),
};
