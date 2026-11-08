import type { EventHandler } from "./types.ts";
import { ClaudeHook } from "../names.ts";

const str = (v: unknown) => (typeof v === "string" ? v : null);

const exitCode = (error: unknown): number | null => {
  if (typeof error !== "string") return null;
  const m = /^Exit code (\d+)/.exec(error.split("\n", 1)[0] ?? "");
  return m ? Number(m[1]) : null;
};

export const handler: EventHandler = {
  event: ClaudeHook.PostToolUseFailure,
  meta: (p) => {
    const server = typeof p.mcp_server === "object" && p.mcp_server !== null ? (p.mcp_server as Record<string, unknown>) : {};
    return {
      tool_name: str(p.tool_name),
      is_interrupt: typeof p.is_interrupt === "boolean" ? p.is_interrupt : null,
      duration_ms: typeof p.duration_ms === "number" ? p.duration_ms : null,
      mcp_server_name: str(server.name),
      mcp_server_source: str(server.source),
      error_exit_code: exitCode(p.error),
    };
  },
};
