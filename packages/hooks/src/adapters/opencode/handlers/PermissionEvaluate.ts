import type { EventHandler } from "./types.ts";
import { OpenCodeHook } from "../names.ts";

const str = (v: unknown) => (typeof v === "string" ? v : null);

export const handler: EventHandler = {
  event: OpenCodeHook.PermissionEvaluate,
  meta: (p) => ({
    action: str(p.action),
    effect: str(p.effect),
    resource_count: Array.isArray(p.resources) ? p.resources.length : null,
    source_type: typeof p.source === "object" && p.source !== null ? str((p.source as Record<string, unknown>).type) : null,
  }),
};
