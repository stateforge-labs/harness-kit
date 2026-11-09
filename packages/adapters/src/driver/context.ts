import type { Clock, RuntimeFs } from "../core/io.ts";
import type { LibraryEvent } from "../core/run.ts";
import type { EnvSource } from "../env.ts";
import type { DirKind } from "./constants.ts";
import { safeEmit } from "./execute.ts";
import type { ProcessRunner } from "./ports.ts";

const noop = (): void => {};

export interface RuntimeState {
  closed: boolean;
  readonly inflight: Set<Promise<unknown>>;
  readonly versions: Map<string, Promise<string | null>>;
  readonly helps: Map<string, Promise<string | null>>;
  readonly liveDirs: Map<string, DirKind>;
  readonly shutdown: AbortController;
}

export interface RuntimeContext {
  readonly source: EnvSource;
  readonly envTransform: ((base: EnvSource) => EnvSource) | undefined;
  readonly runner: ProcessRunner;
  readonly fs: RuntimeFs;
  readonly clock: Clock;
  readonly platform: string;
  readonly cwd: () => string;
  readonly onEvent: ((event: LibraryEvent) => void) | undefined;
  readonly state: RuntimeState;
}

export interface LinkedSignal {
  readonly signal: AbortSignal;
  dispose(): void;
}

export function newState(): RuntimeState {
  return {
    closed: false,
    inflight: new Set(),
    versions: new Map(),
    helps: new Map(),
    liveDirs: new Map(),
    shutdown: new AbortController(),
  };
}

export function emit(ctx: RuntimeContext, event: LibraryEvent): void {
  safeEmit(ctx.onEvent, event);
}

export function track<T>(ctx: RuntimeContext, work: Promise<T>): Promise<T> {
  const inflight = ctx.state.inflight;
  inflight.add(work);
  const forget = (): void => {
    inflight.delete(work);
  };
  void work.then(forget, forget);
  return work;
}

export function linkSignals(caller: AbortSignal | undefined, shutdown: AbortSignal): LinkedSignal {
  const signal = caller === undefined ? shutdown : AbortSignal.any([caller, shutdown]);
  return { signal, dispose: noop };
}
