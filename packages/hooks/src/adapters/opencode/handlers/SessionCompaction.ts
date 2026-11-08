import type { EventHandler } from "./types.ts";
import { OpenCodeHook } from "../names.ts";

export const handler: EventHandler = {
  event: OpenCodeHook.SessionCompaction,
  meta: () => ({}),
};
