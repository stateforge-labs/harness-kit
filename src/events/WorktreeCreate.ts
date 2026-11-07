// WorktreeCreate: HTTP hooks can return JSON, but the docs say a missing worktreePath fails creation, so this passive {} is a known gap to review.
import type { EventHandler } from "./types.ts";

export const handler: EventHandler = {
  event: "WorktreeCreate",
  required: ["name"],
  meta: (p) => ({ name: typeof p.name === "string" ? p.name : null }),
  respond: () => ({}),
};
