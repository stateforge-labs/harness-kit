import type { EventHandler } from "./types.ts";
import { OpenCodeHook } from "../names.ts";

export const handler: EventHandler = {
  event: OpenCodeHook.SessionExperimentalIdle,
  meta: (p) => ({
    background_count: Array.isArray(p.background) ? p.background.length : null,
  }),
};
