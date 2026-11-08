import type { EventHandler } from "./types.ts";
import { CodexHook } from "../names.ts";

const str = (v: unknown) => (typeof v === "string" ? v : null);

export const handler: EventHandler = {
  event: CodexHook.SubagentStart,
  meta: (p) => ({
    agent_type: str(p.agent_type),
    permission_mode: str(p.permission_mode),
  }),
};
