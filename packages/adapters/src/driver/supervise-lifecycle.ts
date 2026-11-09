import type { Clock } from "../core/io.ts";
import { AbortEvent, DRAIN_GRACE_MS, DrainStep, KILL_GRACE_MS, Signal, StopReason } from "./constants.ts";
import type { ProcessExit } from "./port.ts";
import type { RunningProcess } from "./ports.ts";
import type { Stop } from "./supervise-failure.ts";

export interface LifecycleInput {
  readonly running: RunningProcess;
  readonly clock: Clock;
  readonly signal: AbortSignal | undefined;
  readonly timeoutMs: number | undefined;
}

export interface Lifecycle {
  readonly exited: Promise<ProcessExit>;
  readonly expired: Promise<typeof DrainStep.Expired>;
  stop(next: Stop): void;
  stopped(): Stop | null;
  finish(): Promise<void>;
}

const noop = (): void => {};

export function lifecycle(input: LifecycleInput): Lifecycle {
  const { running, clock, signal, timeoutMs } = input;
  let current: Stop | null = null;
  let exited = false;
  let cancelTimeout: () => void = noop;
  let cancelKill: () => void = noop;
  let cancelDrain: () => void = noop;
  let expire: () => void = noop;
  const expired = new Promise<typeof DrainStep.Expired>((resolve) => {
    expire = () => resolve(DrainStep.Expired);
  });

  const stop = (next: Stop): void => {
    if (current !== null) {
      return;
    }
    current = next;
    if (exited) {
      return;
    }
    running.signalGroup(Signal.Term);
    cancelKill = clock.after(KILL_GRACE_MS, () => running.signalGroup(Signal.Kill));
  };

  const onAbort = (): void => stop({ kind: StopReason.Aborted });
  signal?.addEventListener(AbortEvent.Abort, onAbort, { once: true });
  if (signal?.aborted === true) {
    onAbort();
  }
  if (timeoutMs !== undefined) {
    cancelTimeout = clock.after(timeoutMs, () => stop({ kind: StopReason.Timeout, timeoutMs }));
  }

  const exit = running.exited.then((result) => {
    exited = true;
    cancelKill();
    cancelTimeout();
    signal?.removeEventListener(AbortEvent.Abort, onAbort);
    cancelDrain = clock.after(DRAIN_GRACE_MS, () => {
      running.signalGroup(Signal.Kill);
      expire();
    });
    return result;
  });

  const finish = async (): Promise<void> => {
    if (!exited) {
      stop({ kind: StopReason.Aborted });
    }
    await exit;
    cancelDrain();
    cancelKill();
    cancelTimeout();
    signal?.removeEventListener(AbortEvent.Abort, onAbort);
  };

  return {
    exited: exit,
    expired,
    stop,
    stopped: () => current,
    finish,
  };
}
