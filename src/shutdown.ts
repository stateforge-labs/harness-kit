import { flushLog } from "./log.ts";

/** What a shutdown needs from a server: stop accepting, and optionally cut connections. */
export interface Stoppable {
  stop(closeActiveConnections?: boolean): Promise<void>;
}

/**
 * On SIGTERM or SIGINT: stop taking connections, let queued log lines reach the disk, then leave with 0. Requests still open after
 * `graceMs` are closed and the exit code is 1; the log is flushed either way. A second signal leaves at once.
 */
export function installGracefulShutdown(server: Stoppable, graceMs: number): void {
  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) process.exit(1);
    stopping = true;
    console.log(`harness-hooks: ${signal}, shutting down`);
    let finished = false;
    const finish = (code: number) => {
      if (finished) return;
      finished = true;
      void flushLog().then(() => process.exit(code));
    };
    const giveUp = setTimeout(() => {
      void server.stop(true);
      finish(1);
    }, graceMs);
    void server.stop().then(() => {
      clearTimeout(giveUp);
      finish(0);
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
