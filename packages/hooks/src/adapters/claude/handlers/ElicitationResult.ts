import type { EventHandler, MetaValue } from "./types.ts";
import { ClaudeHook } from "../names.ts";

const scalar = (v: unknown): MetaValue | undefined =>
  typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v === null ? v : undefined;

export const handler: EventHandler = {
  event: ClaudeHook.ElicitationResult,
  meta: (p) => {
    const out: Record<string, MetaValue> = {};
    for (const k of ["mcp_server_name", "action", "mode", "elicitation_id"]) {
      const v = scalar(p[k]);
      if (v !== undefined) out[k] = v;
    }
    return out;
  },
};
