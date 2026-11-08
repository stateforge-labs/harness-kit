// The middleware chain every event passes through between decode and encode. A middleware sees the neutral event (and the native
// payload, read-only), may call `next()` to get what the layers below it decided, and returns the reply for its position:
// add to it, replace it, or pass it through. Registration order is outside-in, like Koa: the first registered runs first and wraps
// the rest. The built-in policy (core/policy.ts) is always the innermost layer, so every middleware can see and change its reply.
import type { NeutralEvent, NeutralKind } from "./event.ts";
import type { Rules } from "./policy.ts";
import { policy } from "./policy.ts";
import type { Deny, NeutralReply } from "./reply.ts";

export interface HookContext {
  readonly event: NeutralEvent;
  /** The adapter's rules text (what the built-in policy says). */
  readonly rules: Rules;
  /** The native payload exactly as the harness sent it. Read-only; never log or forward it whole (it holds prompts and tool input). */
  readonly raw: Readonly<Record<string, unknown>>;
}

/** Runs the layers below and resolves to their reply. Calling it more than once returns the same answer; the layers run once. */
export type Next = () => Promise<NeutralReply>;

/**
 * One layer. It may be sync or async. If it throws, rejects, or works longer than its timeout, its fault mode decides the answer
 * (LayerOptions.onFault): skipped by default, so a broken middleware never stops an agent. A deny from the layers below always
 * stays in the answer, whatever this layer returns.
 */
export type Middleware = (ctx: HookContext, next: Next) => NeutralReply | Promise<NeutralReply>;

/**
 * Two replies in one, `a` from the layers below and `b` from the layer adding to it. Context texts are joined by a blank line
 * (below first). `a`'s deny and continue win over `b`'s, so adding to a reply never weakens what the layers below decided;
 * `allow` is kept if either has it (an adapter never encodes allow next to a deny).
 */
export function mergeReplies(a: NeutralReply, b: NeutralReply): NeutralReply {
  const out: NeutralReply = {};
  const texts = [a.context, b.context].filter((t): t is string => typeof t === "string" && t !== "");
  if (texts.length) out.context = texts.join("\n\n");
  const deny = a.deny ?? b.deny;
  if (deny) out.deny = deny;
  const cont = a.continue ?? b.continue;
  if (cont) out.continue = cont;
  if (a.allow || b.allow) out.allow = true;
  return out;
}

/** Runs `mw` only for events of these kinds; for any other event it is transparent. */
export function onKinds(kinds: readonly NeutralKind[], mw: Middleware): Middleware {
  return (ctx, next) => (kinds.includes(ctx.event.kind) ? mw(ctx, next) : next());
}

/** The built-in policy as a layer: whatever is below it plus what the rules say. */
export const policyLayer: Middleware = async (ctx, next) => mergeReplies(await next(), policy(ctx.event, ctx.rules));

export interface PipelineOptions {
  /** The default per-layer timeout (default 2000 ms). See LayerOptions.timeoutMs. */
  timeoutMs?: number;
  /** Called with a layer's error or timeout; defaults to console.error. Must not throw. */
  onFault?: (message: string) => void;
}

/** What a layer's fault (a throw, a rejection, a timeout) turns into. */
export type FaultMode = "skip" | { deny: Deny };

export interface LayerOptions {
  /**
   * How long this layer may work, not counting the time it waits on `next()` (the layers below have their own budgets). So the
   * worst case for one event is the sum of every layer's timeout, and that sum is what the ordering rule in docs/architecture.md
   * compares with the shim's and the harness's timeouts. Defaults to the pipeline's timeoutMs.
   */
  timeoutMs?: number;
  /**
   * "skip" (default): the answer is what the layers below decided, so a broken layer never stops an agent (the service).
   * `{ deny }`: the answer is this deny, so a layer that cannot decide refuses (StateForge's `state-unavailable`).
   */
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

  /**
   * Adds layers inside the ones already added. `use(a, b, c)` adds plain layers (pipeline timeout, onFault "skip");
   * `use(layer, { timeoutMs, onFault })` adds one layer with its own options.
   */
  use(layer: Middleware, options: LayerOptions): this;
  use(...layers: Middleware[]): this;
  use(...args: unknown[]): this {
    if (args.length === 2 && typeof args[0] === "function" && typeof args[1] === "object" && args[1] !== null) {
      const o = args[1] as LayerOptions;
      if (o.timeoutMs !== undefined && !(Number.isFinite(o.timeoutMs) && o.timeoutMs > 0)) throw new TypeError("use(): timeoutMs must be a positive number");
      if (o.onFault !== undefined && o.onFault !== "skip" && !(typeof o.onFault === "object" && typeof o.onFault.deny?.reason === "string")) {
        throw new TypeError('use(): onFault must be "skip" or { deny: { reason, hint? } }');
      }
      this.#layers.push({ fn: args[0] as Middleware, timeoutMs: o.timeoutMs ?? this.#timeoutMs, onFault: o.onFault ?? "skip" });
      return this;
    }
    for (const fn of args) {
      if (typeof fn !== "function") throw new TypeError("use(): a layer must be a function; options go as use(layer, options)");
      this.#layers.push({ fn: fn as Middleware, timeoutMs: this.#timeoutMs, onFault: "skip" });
    }
    return this;
  }

  get size(): number {
    return this.#layers.length;
  }

  /**
   * The deny of the outermost layer registered with `onFault: { deny }`, if any. `handle()` answers it when the pipeline cannot
   * run at all (decode or the pipeline itself threw), so a fail-closed pipeline stays closed.
   */
  get failClosed(): Deny | undefined {
    for (const l of this.#layers) if (l.onFault !== "skip") return l.onFault.deny;
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

      // Deny wins: whatever this layer answers, a deny from below stays.
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
        this.#fault(`middleware ${name} ${message}; ${mode === "skip" ? "skipped" : "denied"}`);
        finish(mode === "skip" ? next() : keepDeny({ deny: mode.deny }));
      };
      const arm = () => {
        startedAt = performance.now();
        timer = setTimeout(() => fault(`timed out after ${layer.timeoutMs} ms`), Math.max(0, remaining));
      };
      // The clock stops while the layer waits on the layers below, and starts again when they answer.
      const next: Next = () => {
        if (!below) {
          clearTimeout(timer);
          remaining -= performance.now() - startedAt;
          below = this.#dispatch(index + 1, ctx);
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
      /* reporting a fault must not become one */
    }
  }
}

const isReply = (v: unknown): v is NeutralReply => typeof v === "object" && v !== null && !Array.isArray(v);

/** The pipeline a server starts from: just the built-in policy. */
export const defaultPipeline = (options?: PipelineOptions): Pipeline => new Pipeline(options).use(policyLayer);
