// PostToolUseFailure: http supported. Passive: never blocks, never injects context (the only context review is PreToolUse Agent).
import type { EventHandler } from "./types.ts";

const str = (v: unknown) => (typeof v === "string" ? v : null);

// Leading "Exit code N" line of a Bash/PowerShell failure. Only the number is kept, never the output.
const exitCode = (error: unknown): number | null => {
  if (typeof error !== "string") return null;
  const m = /^Exit code (\d+)/.exec(error.split("\n", 1)[0] ?? "");
  return m ? Number(m[1]) : null;
};

export const handler: EventHandler = {
  event: "PostToolUseFailure",
  // Tool name, abort flag, duration, MCP server name and source, exit code. Never tool_input, error text or tool_use_id.
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
  respond: () => ({}),
};
