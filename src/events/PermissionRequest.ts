import type { EventHandler } from "./types.ts";

export const handler: EventHandler = {
  event: "PermissionRequest",
  required: [],
  meta: () => ({}),
  respond: () => ({}),
};
