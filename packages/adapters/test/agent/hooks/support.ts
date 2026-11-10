import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Kind, Pipeline, once, stopGuard, toolAllowlist, type HookContext, type Middleware, type NeutralKind } from "@stateforge-labs/harness-hooks";
import type { HookPoint } from "../../../src/agent/constants.ts";
import type { HookObserver } from "../../../src/agent/hooks/index.ts";

export const SESSION_CONTEXT = "session context from the consumer";
export const DENY = { reason: "tool not allowed", hint: "use Read" };
export const ALLOWED_TOOLS = ["Read"];
export const STOP_REASON = "keep going";

const FIXTURES = join(import.meta.dir, "fixtures");

export type Payload = Record<string, unknown>;

export function liveFixtures(): { readonly name: string; readonly payload: Payload }[] {
  return readdirSync(FIXTURES)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => ({ name: file, payload: JSON.parse(readFileSync(join(FIXTURES, file), "utf8")) as Payload }));
}

export function fixture(name: string): Payload {
  return JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as Payload;
}

export function withEvent(name: string, patch: Payload): Payload {
  return { ...fixture(name), ...patch };
}

export interface Seen {
  readonly kind: NeutralKind;
  readonly raw: Readonly<Record<string, unknown>>;
}

export function recorder(seen: Seen[]): Middleware {
  return function recorder(ctx: HookContext, next) {
    seen.push({ kind: ctx.event.kind, raw: ctx.raw });
    return next();
  };
}

export function continueOnStop(): Middleware {
  return function continueOnStop(ctx, next) {
    if (ctx.event.kind !== Kind.Stop) return next();
    return { continue: { reason: STOP_REASON } };
  };
}

export function stockPipeline(seen: Seen[] = []): Pipeline {
  return new Pipeline().use(
    recorder(seen),
    toolAllowlist({ allow: ALLOWED_TOOLS, deny: DENY }),
    stopGuard({ limit: 1, reason: STOP_REASON }),
    once(() => SESSION_CONTEXT, { kinds: [Kind.SessionStart, Kind.PromptSubmit] }),
    continueOnStop(),
  );
}

export interface Heard extends HookObserver {
  readonly refusals: Parameters<HookObserver["refused"]>[0][];
  readonly contexts: { readonly point: HookPoint; readonly text: string }[];
}

export function observer(): Heard {
  const refusals: Heard["refusals"] = [];
  const contexts: { point: HookPoint; text: string }[] = [];
  return {
    refusals,
    contexts,
    refused: (r) => void refusals.push(r),
    context: (point, text) => void contexts.push({ point, text }),
  };
}
