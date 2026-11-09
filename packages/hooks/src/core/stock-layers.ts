import type { HookContext, Middleware } from "./pipeline.ts";
import { mergeReplies } from "./pipeline.ts";
import { StockFailure } from "./constants.ts";
import type { NeutralKind } from "./event.ts";
import { Kind } from "./event.ts";

/** Options for `stopGuard`. */
export interface StopGuardOptions {
  /** Most continues granted per session; a whole number, 0 or more. */
  limit: number;
  /** Continue reason used when the layer below gives an empty one. */
  reason: string;
  /** Items still missing, used when the layer below names none. */
  missing?: string[];
}

/**
 * Caps how often a Stop or SubagentStop may continue the agent: after `limit` continues in a session the continue is dropped.
 * Throws a `TypeError` when `limit` is not a non-negative integer.
 */
export function stopGuard(options: StopGuardOptions): Middleware {
  const { limit, reason, missing } = options;
  if (!Number.isInteger(limit) || limit < 0) throw new TypeError(StockFailure.StopGuardLimit);
  const continues = new Map<string | null, number>();
  return async function stopGuard(ctx, next) {
    const { kind, session } = ctx.event;
    if (kind !== Kind.Stop && kind !== Kind.SubagentStop) return next();
    const below = await next();
    if (!below.continue) return below;
    const count = continues.get(session) ?? 0;
    if (count >= limit) {
      const { continue: _dropped, ...rest } = below;
      return rest;
    }
    continues.set(session, count + 1);
    const given = below.continue;
    const text = given.reason === "" ? reason : given.reason;
    const list = given.missing ?? missing;
    return { ...below, continue: list ? { reason: text, missing: list } : { reason: text } };
  };
}

/** Options for `once`. */
export interface OnceOptions {
  /** Event kinds that trigger the injection. */
  kinds: readonly NeutralKind[];
}

/** Injects `inject(ctx)` as context the first time a session raises one of `options.kinds`; a null or empty text injects nothing. */
export function once(inject: (ctx: HookContext) => string | null, options: OnceOptions): Middleware {
  const { kinds } = options;
  const seen = new Set<string | null>();
  return async function once(ctx, next) {
    const { kind, session } = ctx.event;
    if (!kinds.includes(kind) || seen.has(session)) return next();
    seen.add(session);
    const text = inject(ctx);
    const below = await next();
    return text === null || text === "" ? below : mergeReplies({ context: text }, below);
  };
}

/** Removes `prefix` from the tool name before the layers below see it; an empty prefix or a name without it passes through. */
export function stripToolPrefix(prefix: string): Middleware {
  return function stripToolPrefix(ctx, next) {
    const { tool } = ctx.event;
    if (prefix === "" || !tool || !tool.name.startsWith(prefix)) return next();
    const stripped: HookContext = { ...ctx, event: { ...ctx.event, tool: { ...tool, name: tool.name.slice(prefix.length) } } };
    return next(stripped);
  };
}
