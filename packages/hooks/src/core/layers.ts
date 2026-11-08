// Stock layers the library ships (ADR 0001). Opt-in: none of them is in defaultPipeline or the service's pipeline.
import type { Middleware } from "./pipeline.ts";
import { mergeReplies } from "./pipeline.ts";
import type { Deny } from "./reply.ts";

export interface ToolAllowlistOptions {
  /**
   * The tools the agent may call, in the harness's own names (Codex `mcp__sf__submit`, OpenCode `sf_submit`, Claude Code
   * `mcp__sf__submit`): exact names, regular expressions, or a predicate. Names differ per harness, so a consumer serving several
   * harnesses builds one allowlist per harness.
   */
  allow: readonly (string | RegExp)[] | ((name: string) => boolean);
  /** What a refused call is told. */
  deny: Deny;
}

/**
 * A second line behind the harness's own "built-ins off" configuration (R-2026-11-07-10, recommendation 1): a pre-tool or
 * permission-request event for a tool that is not allowed is denied, and so is one whose payload names no tool. A
 * permission-request for an allowed tool is answered allow, which a headless Codex run needs to call an MCP tool at all.
 * Every other event passes through. It denies without asking the layers below, and their deny would win anyway.
 */
export function toolAllowlist(options: ToolAllowlistOptions): Middleware {
  const { allow, deny } = options;
  const allowed =
    typeof allow === "function"
      ? allow
      : (name: string) => allow.some((a) => (typeof a === "string" ? a === name : new RegExp(a.source, a.flags.replace("g", "")).test(name)));
  return async function toolAllowlist(ctx, next) {
    const { kind, tool } = ctx.event;
    if (kind !== "pre-tool" && kind !== "permission-request") return next();
    if (!tool || !allowed(tool.name)) return { deny };
    const below = await next();
    return kind === "permission-request" ? mergeReplies(below, { allow: true }) : below;
  };
}
