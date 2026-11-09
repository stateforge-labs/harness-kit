import { flushLog } from "./log.ts";

export interface Stoppable {
  close(options?: { force?: boolean }): Promise<void>;
}

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
      void server.close({ force: true });
      finish(1);
    }, graceMs);
    void server.close().then(() => {
      clearTimeout(giveUp);
      finish(0);
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
