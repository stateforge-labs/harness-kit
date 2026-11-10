import type { RunFailure } from "../core/failure.ts";
import { UnavailableReason } from "../core/failure.ts";
import type { JsonValue } from "../core/json.ts";
import { REDACTED } from "../core/redact.ts";
import type { Result } from "../core/result.ts";
import { isSecret } from "../core/secret.ts";
import type { SessionId } from "../core/session.ts";
import { captureThrow, settle } from "../driver/execute.ts";
import { AgentMessage, SCRUB_DEPTH } from "./constants.ts";
import type { AgentEnd, AgentEngineRun } from "./engine.ts";
import type { AgentEvent, AgentOutput, TurnUsage } from "./types.ts";

const noop = (): void => {};

export interface Channel<T> {
  readonly iterable: AsyncIterable<T>;
  push(item: T): void;
  close(): void;
}

export function channel<T>(): Channel<T> {
  const queue: T[] = [];
  let waiting: ((step: IteratorResult<T>) => void) | null = null;
  let closed = false;
  let abandoned = false;
  const finished = (): IteratorResult<T> => ({ done: true, value: undefined });
  return {
    push(item) {
      if (closed || abandoned) {
        return;
      }
      if (waiting === null) {
        queue.push(item);
        return;
      }
      const resolve = waiting;
      waiting = null;
      resolve({ done: false, value: item });
    },
    close() {
      closed = true;
      const resolve = waiting;
      waiting = null;
      resolve?.(finished());
    },
    iterable: {
      [Symbol.asyncIterator]() {
        return {
          next(): Promise<IteratorResult<T>> {
            const item = queue.shift();
            if (item !== undefined) {
              return Promise.resolve({ done: false, value: item });
            }
            if (closed || abandoned) {
              return Promise.resolve(finished());
            }
            return new Promise<IteratorResult<T>>((resolve) => {
              waiting = resolve;
            });
          },
          return(): Promise<IteratorResult<T>> {
            abandoned = true;
            queue.length = 0;
            return Promise.resolve(finished());
          },
        };
      },
    },
  };
}

function walk(value: unknown, redact: (text: string) => string, depth: number): unknown {
  if (typeof value === "string") {
    return redact(value);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  if (isSecret(value) || depth > SCRUB_DEPTH) {
    return REDACTED;
  }
  if (Array.isArray(value)) {
    return value.map((item: unknown) => walk(item, redact, depth + 1));
  }
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    return REDACTED;
  }
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    out[redact(key)] = walk(child, redact, depth + 1);
  }
  return out;
}

export function scrub<T>(value: T, redact: (text: string) => string): T {
  const taken = captureThrow(() => walk(value, redact, 0) as T);
  return taken.ok ? taken.value : (REDACTED as unknown as T);
}

export function internalFailure(): RunFailure {
  return { kind: "unavailable", message: AgentMessage.InternalError, reason: UnavailableReason.InternalError };
}

export interface Seen {
  readonly usage: TurnUsage[];
  sessionId: SessionId | null;
  checkpoint: string | null;
  output: JsonValue | null;
}

export function newSeen(): Seen {
  return { usage: [], sessionId: null, checkpoint: null, output: null };
}

export function observe(seen: Seen, event: AgentEvent): void {
  if (event.kind === "usage") {
    seen.usage.push({ turn: event.turn, model: event.model, input: event.input, cacheWrite: event.cacheWrite, cacheRead: event.cacheRead, output: event.output });
  } else if (event.kind === "session") {
    seen.sessionId = event.id;
    seen.checkpoint = event.checkpoint;
  } else if (event.kind === "output") {
    seen.output = event.value;
  }
}

export function merge(seen: Seen, output: AgentOutput): AgentOutput {
  return {
    ...output,
    usage: seen.usage.length > 0 ? seen.usage : output.usage,
    sessionId: output.sessionId ?? seen.sessionId,
    checkpoint: output.checkpoint ?? seen.checkpoint,
    output: output.output ?? seen.output,
  };
}

export interface Drained {
  readonly threw: boolean;
  readonly end: Result<AgentEnd, RunFailure> | null;
}

export async function drain(run: AgentEngineRun, onEvent: (event: AgentEvent) => void): Promise<Drained> {
  const done = captureThrow(() => run.done);
  if (done.ok) {
    void done.value.then(noop, noop);
  }
  const opened = captureThrow(() => run.events[Symbol.asyncIterator]());
  let threw = !opened.ok;
  if (opened.ok) {
    const iterator = opened.value;
    for (;;) {
      const step = await settle(() => iterator.next());
      if (!step.ok) {
        threw = true;
        break;
      }
      if (step.value.done === true) {
        break;
      }
      captureThrow(() => onEvent(step.value.value));
    }
  }
  if (threw) {
    captureThrow(() => run.cancel());
  }
  if (!done.ok) {
    return { threw: true, end: null };
  }
  const end = await settle(() => done.value);
  return end.ok ? { threw, end: end.value } : { threw: true, end: null };
}
