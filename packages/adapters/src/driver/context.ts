import type { Clock, RuntimeFs } from "../core/io.ts";
import type { LibraryEvent } from "../core/run.ts";
import type { EnvSource } from "../env.ts";
import { type DirKind, RUN_ID_SEPARATOR } from "./constants.ts";
import type { EngineIo } from "./engine.ts";
import { safeEmit } from "./execute.ts";
import type { ProcessRunner } from "./ports.ts";

const noop = (): void => {};

export interface RuntimeState {
  closed: boolean;
  runs: number;
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
  readonly allowedModes?: readonly string[];
  readonly state: RuntimeState;
}

export interface LinkedSignal {
  readonly signal: AbortSignal;
  dispose(): void;
}

export function newState(): RuntimeState {
  return {
    closed: false,
    runs: 0,
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

export function nextRunId(ctx: RuntimeContext): string {
  ctx.state.runs += 1;
  return `${ctx.clock.now()}${RUN_ID_SEPARATOR}${ctx.state.runs}`;
}

export function engineIo(ctx: RuntimeContext): EngineIo {
  return { runner: ctx.runner, clock: ctx.clock, fs: ctx.fs, sleep: (ms) => new Promise<void>((resolve) => ctx.clock.after(ms, resolve)) };
}
