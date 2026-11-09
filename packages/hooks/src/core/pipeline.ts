import type { NeutralEvent, NeutralKind } from "./event.ts";
import type { Rules } from "./policy.ts";
import { policy } from "./policy.ts";
import { WORKTREE_TIMEOUT_MS, worktreeLayer } from "./worktree.ts";
import type { Deny, NeutralReply } from "./reply.ts";

export interface HookContext {
  readonly event: NeutralEvent;
  readonly rules: Rules;
  readonly raw: Readonly<Record<string, unknown>>;
}

export type Next = (ctx?: HookContext) => Promise<NeutralReply>;

export type Middleware = (ctx: HookContext, next: Next) => NeutralReply | Promise<NeutralReply>;

export function mergeReplies(a: NeutralReply, b: NeutralReply): NeutralReply {
  const out: NeutralReply = {};
  const texts = [a.context, b.context].filter((t): t is string => typeof t === "string" && t !== "");
  if (texts.length) out.context = texts.join("\n\n");
  const deny = a.deny ?? b.deny;
  if (deny) out.deny = deny;
  const cont = a.continue ?? b.continue;
  if (cont) out.continue = cont;
  if (a.allow || b.allow) out.allow = true;
  const worktree = a.worktree ?? b.worktree;
  if (worktree) out.worktree = worktree;
  return out;
}

export function onKinds(kinds: readonly NeutralKind[], mw: Middleware): Middleware {
  return (ctx, next) => (kinds.includes(ctx.event.kind) ? mw(ctx, next) : next());
}

export const policyLayer: Middleware = async (ctx, next) => mergeReplies(await next(), policy(ctx.event, ctx.rules));

export interface PipelineOptions {
  timeoutMs?: number;
  onFault?: (message: string) => void;
}

export const FaultSkip = "skip";
export type FaultMode = typeof FaultSkip | { deny: Deny };

export interface LayerOptions {
  timeoutMs?: number;
  onFault?: FaultMode;
}

interface Layer {
  fn: Middleware;
  timeoutMs: number;
  onFault: FaultMode;
}

export class Pipeline {
  readonly #layers: Layer[] = [];
  readonly #timeoutMs: number;
  readonly #onFault: (message: string) => void;

  constructor(options: PipelineOptions = {}) {
    this.#timeoutMs = options.timeoutMs ?? 2000;
    this.#onFault = options.onFault ?? ((m) => console.error(m));
  }

  use(layer: Middleware, options: LayerOptions): this;
  use(...layers: Middleware[]): this;
  use(...args: unknown[]): this {
    if (args.length === 2 && typeof args[0] === "function" && typeof args[1] === "object" && args[1] !== null) {
      const o = args[1] as LayerOptions;
      if (o.timeoutMs !== undefined && !(Number.isFinite(o.timeoutMs) && o.timeoutMs > 0)) throw new TypeError("use(): timeoutMs must be a positive number");
      if (o.onFault !== undefined && o.onFault !== FaultSkip && !(typeof o.onFault === "object" && typeof o.onFault.deny?.reason === "string")) {
        throw new TypeError(`use(): onFault must be "${FaultSkip}" or { deny: { reason, hint? } }`);
      }
      this.#layers.push({ fn: args[0] as Middleware, timeoutMs: o.timeoutMs ?? this.#timeoutMs, onFault: o.onFault ?? FaultSkip });
      return this;
    }
    for (const fn of args) {
      if (typeof fn !== "function") throw new TypeError("use(): a layer must be a function; options go as use(layer, options)");
      this.#layers.push({ fn: fn as Middleware, timeoutMs: this.#timeoutMs, onFault: FaultSkip });
    }
    return this;
  }

  get size(): number {
    return this.#layers.length;
  }

  get failClosed(): Deny | undefined {
    for (const l of this.#layers) if (l.onFault !== FaultSkip) return l.onFault.deny;
    return undefined;
  }

  run(ctx: HookContext): Promise<NeutralReply> {
    return this.#dispatch(0, ctx);
  }

  #dispatch(index: number, ctx: HookContext): Promise<NeutralReply> {
    const layer = this.#layers[index];
    if (!layer) return Promise.resolve({});
    const name = layer.fn.name || `layer ${index}`;
    return new Promise<NeutralReply>((resolve) => {
      let settled = false;
      let below: Promise<NeutralReply> | undefined;
      let remaining = layer.timeoutMs;
      let startedAt = 0;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const keepDeny = async (reply: NeutralReply): Promise<NeutralReply> => {
        if (!below) return reply;
        const b = await below;
        return b.deny ? { ...reply, deny: b.deny } : reply;
      };
      const finish = (reply: Promise<NeutralReply>) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(reply);
      };
      const fault = (message: string) => {
        if (settled) return;
        const mode = layer.onFault;
        this.#fault(`middleware ${name} ${message}; ${mode === FaultSkip ? "skipped" : "denied"}`);
        finish(mode === FaultSkip ? next() : keepDeny({ deny: mode.deny }));
      };
      const arm = () => {
        startedAt = performance.now();
        timer = setTimeout(() => fault(`timed out after ${layer.timeoutMs} ms`), Math.max(0, remaining));
      };
      const next: Next = (override) => {
        if (!below) {
          clearTimeout(timer);
          remaining -= performance.now() - startedAt;
          below = this.#dispatch(index + 1, override ?? ctx);
          void below.then(() => {
            if (!settled) arm();
          });
        }
        return below;
      };

      arm();
      Promise.resolve()
        .then(() => layer.fn(ctx, next))
        .then(
          (reply) => finish(isReply(reply) ? keepDeny(reply) : next()),
          (err) => fault(`failed: ${err instanceof Error ? err.message : String(err)}`),
        );
    });
  }

  #fault(message: string): void {
    try {
      this.#onFault(message);
    } catch {
    }
  }
}

const isReply = (v: unknown): v is NeutralReply => typeof v === "object" && v !== null && !Array.isArray(v);

export const defaultPipeline = (options?: PipelineOptions): Pipeline =>
  new Pipeline(options).use(worktreeLayer, { timeoutMs: WORKTREE_TIMEOUT_MS }).use(policyLayer);
