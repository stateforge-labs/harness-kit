// The middleware chain every event passes through between decode and encode. A middleware sees the neutral event (and the native
// payload, read-only), may call `next()` to get what the layers below it decided, and returns the reply for its position:
// add to it, replace it, or pass it through. Registration order is outside-in, like Koa: the first registered runs first and wraps
// the rest. The built-in policy (core/policy.ts) is always the innermost layer, so every middleware can see and change its reply.
import type { NeutralEvent, NeutralKind } from "./event.ts";
import type { Rules } from "./policy.ts";
import { policy } from "./policy.ts";
import type { NeutralReply } from "./reply.ts";

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
 * One layer. It may be sync or async. If it throws, rejects, or takes longer than the pipeline's timeout, it is skipped: the
 * answer is whatever the layers below it decided, so a broken middleware never stops an agent.
 */
export type Middleware = (ctx: HookContext, next: Next) => NeutralReply | Promise<NeutralReply>;

/** Two replies in one: their context texts are joined by a blank line. */
export function mergeReplies(a: NeutralReply, b: NeutralReply): NeutralReply {
  const texts = [a.context, b.context].filter((t): t is string => typeof t === "string" && t !== "");
  return texts.length ? { context: texts.join("\n\n") } : {};
}

/** Runs `mw` only for events of these kinds; for any other event it is transparent. */
export function onKinds(kinds: readonly NeutralKind[], mw: Middleware): Middleware {
  return (ctx, next) => (kinds.includes(ctx.event.kind) ? mw(ctx, next) : next());
}

/** The built-in policy as a layer: whatever is below it plus what the rules say. */
export const policyLayer: Middleware = async (ctx, next) => mergeReplies(await next(), policy(ctx.event, ctx.rules));

export interface PipelineOptions {
  /** A layer that has not answered after this long is skipped (default 2000 ms). */
  timeoutMs?: number;
  /** Called with a layer's error or timeout; defaults to console.error. Must not throw. */
  onFault?: (message: string) => void;
}

export class Pipeline {
  readonly #layers: Middleware[] = [];
  readonly #timeoutMs: number;
  readonly #onFault: (message: string) => void;

  constructor(options: PipelineOptions = {}) {
    this.#timeoutMs = options.timeoutMs ?? 2000;
    this.#onFault = options.onFault ?? ((m) => console.error(m));
  }

  /** Adds a layer inside the ones already added. */
  use(...layers: Middleware[]): this {
    this.#layers.push(...layers);
    return this;
  }

  get size(): number {
    return this.#layers.length;
  }

  run(ctx: HookContext): Promise<NeutralReply> {
    return this.#dispatch(0, ctx);
  }

  #dispatch(index: number, ctx: HookContext): Promise<NeutralReply> {
    const layer = this.#layers[index];
    if (!layer) return Promise.resolve({});
    let below: Promise<NeutralReply> | undefined;
    const next: Next = () => (below ??= this.#dispatch(index + 1, ctx));
    const name = layer.name || `layer ${index}`;
    return new Promise<NeutralReply>((resolve) => {
      const timer = setTimeout(() => {
        this.#fault(`middleware ${name} timed out after ${this.#timeoutMs} ms; skipped`);
        resolve(next());
      }, this.#timeoutMs);
      Promise.resolve()
        .then(() => layer(ctx, next))
        .then(
          (reply) => {
            clearTimeout(timer);
            resolve(isReply(reply) ? reply : next());
          },
          (err) => {
            clearTimeout(timer);
            this.#fault(`middleware ${name} failed: ${err instanceof Error ? err.message : String(err)}; skipped`);
            resolve(next());
          },
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
