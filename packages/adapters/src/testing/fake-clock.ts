import type { Clock } from "../core/io.ts";

interface Timer {
  readonly at: number;
  readonly fn: () => void;
  cancelled: boolean;
}

export function fakeClock(start = 0): Clock & { advance(ms: number): void } {
  let current = start;
  const timers: Timer[] = [];
  const nextDue = (limit: number): Timer | undefined =>
    timers
      .filter((timer) => !timer.cancelled && timer.at <= limit)
      .sort((a, b) => a.at - b.at)[0];
  return {
    now: () => current,
    after(ms, fn) {
      const timer: Timer = { at: current + ms, fn, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
    advance(ms) {
      const target = current + ms;
      for (let due = nextDue(target); due !== undefined; due = nextDue(target)) {
        current = due.at;
        due.cancelled = true;
        due.fn();
      }
      current = target;
    },
  };
}
