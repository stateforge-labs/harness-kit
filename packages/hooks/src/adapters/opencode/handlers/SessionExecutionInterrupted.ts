import type { EventHandler } from "./types.ts";
import { OpenCodeHook } from "../names.ts";

const str = (v: unknown) => (typeof v === "string" ? v : null);

export const handler: EventHandler = {
  event: OpenCodeHook.SessionExecutionInterrupted,
  meta: (p) => ({
    reason: str(p.reason),
  }),
};
