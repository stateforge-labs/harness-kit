import type { Middleware } from "./pipeline.ts";
import { mergeReplies } from "./pipeline.ts";
import type { Deny } from "./reply.ts";
import { Kind } from "./event.ts";

export interface ToolAllowlistOptions {
  allow: readonly (string | RegExp)[] | ((name: string) => boolean);
  deny: Deny;
}

export function toolAllowlist(options: ToolAllowlistOptions): Middleware {
  const { allow, deny } = options;
  const allowed =
    typeof allow === "function"
      ? allow
      : (name: string) => allow.some((a) => (typeof a === "string" ? a === name : new RegExp(a.source, a.flags.replace("g", "")).test(name)));
  return async function toolAllowlist(ctx, next) {
    const { kind, tool } = ctx.event;
    if (kind !== Kind.PreTool && kind !== Kind.PermissionRequest) return next();
    if (!tool || !allowed(tool.name)) return { deny };
    const below = await next();
    return kind === Kind.PermissionRequest ? mergeReplies(below, { allow: true }) : below;
  };
}
