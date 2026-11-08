import type { EventHandler } from "./types.ts";
import { CodexHook } from "../names.ts";

const str = (v: unknown) => (typeof v === "string" ? v : null);

export const handler: EventHandler = {
  event: CodexHook.Stop,
  meta: (p) => ({
    permission_mode: str(p.permission_mode),
    stop_hook_active: typeof p.stop_hook_active === "boolean" ? p.stop_hook_active : null,
  }),
};
