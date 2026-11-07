import type { EventHandler } from "./types.ts";

export const handler: EventHandler = {
  event: "PermissionDenied",
  required: [],
  meta: () => ({}),
  respond: () => ({}),
};
