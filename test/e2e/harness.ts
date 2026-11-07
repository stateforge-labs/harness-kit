import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** A real `bun src/server.ts` process. Tests talk to it over HTTP only. */
export interface RunningServer {
  base: string;
  logFile: string;
  stop(): Promise<void>;
}

export async function startServer(env: Record<string, string> = {}): Promise<RunningServer> {
  const dir = await mkdtemp(join(tmpdir(), "harness-hooks-"));
  const logFile = join(dir, "events.jsonl");
  const proc = Bun.spawn(["bun", "src/server.ts"], {
    cwd: join(import.meta.dir, "..", ".."),
    env: { ...process.env, PORT: "0", HOOK_LOG_FILE: logFile, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });

  // The server prints "harness-hooks listening on :<port>"; PORT=0 avoids picking a port ourselves.
  const reader = proc.stdout.getReader();
  const decoder = new TextDecoder();
  let seen = "";
  const deadline = Date.now() + 10_000;
  let port = 0;
  while (!port) {
    if (Date.now() > deadline) {
      proc.kill();
      throw new Error(`server did not announce a port; output so far: ${seen}`);
    }
    const { value, done } = await reader.read();
    if (done) throw new Error(`server exited early; output: ${seen}`);
    seen += decoder.decode(value);
    const m = /listening on :(\d+)/.exec(seen);
    if (m) port = Number(m[1]);
  }
  reader.releaseLock();

  return {
    base: `http://127.0.0.1:${port}`,
    logFile,
    async stop() {
      proc.kill("SIGTERM");
      await proc.exited;
      await rm(dir, { recursive: true, force: true });
    },
  };
}

/** Poll until `check` returns a value or the timeout passes. */
export async function eventually<T>(check: () => Promise<T | undefined>, ms = 3000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await check();
    if (v !== undefined) return v;
    if (Date.now() > end) throw new Error("condition not met in time");
    await Bun.sleep(25);
  }
}
