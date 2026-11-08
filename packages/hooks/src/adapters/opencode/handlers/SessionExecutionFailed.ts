import type { EventHandler } from "./types.ts";
import { OpenCodeHook } from "../names.ts";

export const handler: EventHandler = {
  event: OpenCodeHook.SessionExecutionFailed,
  meta: (p) => ({
    error_type: typeof p.error === "object" && p.error !== null && typeof (p.error as Record<string, unknown>).type === "string" ? ((p.error as Record<string, unknown>).type as string) : null,
  }),
};
