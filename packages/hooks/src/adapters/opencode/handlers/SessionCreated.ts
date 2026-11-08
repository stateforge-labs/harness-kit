import type { EventHandler } from "./types.ts";
import { OpenCodeHook } from "../names.ts";

export const handler: EventHandler = {
  event: OpenCodeHook.SessionCreated,
  meta: (p) => ({
    is_child: typeof p.parentID === "string",
  }),
};
