import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** The parent environment without anything the server reads, so a stray HOOK_* or PORT never decides a test. */
function cleanEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env };
  for (const k of Object.keys(env)) if (k === "PORT" || k.startsWith("HOOK_")) delete env[k];
  return env;
}

/** A real `bun src/server.ts` process. Tests talk to it over HTTP only. */
export interface RunningServer {
  base: string;
  /** The address the server says it bound, read from its startup line. */
  host: string;
  port: number;
  logFile: string;
  /** Sends the signal, waits for the process to leave, removes its temp dir and returns the exit code. */
  stop(signal?: "SIGTERM" | "SIGINT"): Promise<number>;
  /** Like stop, but leaves the temp dir so the log can be read after exit; call cleanup() afterwards. */
  stopKeepingLog(signal?: "SIGTERM" | "SIGINT"): Promise<number>;
  cleanup(): Promise<void>;
}

/** What a server that was told to refuse to start did. `code` is null if it was still running at the deadline. */
export interface Refusal {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** Starts the real server expecting it to exit; kills it at the deadline so a server that wrongly listens fails the test. */
export async function refusesToStart(env: Record<string, string>, ms = 5000): Promise<Refusal> {
  const proc = Bun.spawn(["bun", "src/server.ts"], {
    cwd: join(import.meta.dir, "..", ".."),
    env: { ...cleanEnv(), PORT: "0", HOOK_LOG_FILE: join(tmpdir(), "harness-hooks-refusal.jsonl"), ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const timer = setTimeout(() => proc.kill(), ms);
  const code = await proc.exited;
  clearTimeout(timer);
  const killed = proc.signalCode !== null;
  return {
    code: killed ? null : code,
    stdout: await new Response(proc.stdout).text(),
    stderr: await new Response(proc.stderr).text(),
  };
}

export async function startServer(env: Record<string, string> = {}): Promise<RunningServer> {
  const dir = await mkdtemp(join(tmpdir(), "harness-hooks-"));
  const logFile = join(dir, "events.jsonl");
  const proc = Bun.spawn(["bun", "src/server.ts"], {
    cwd: join(import.meta.dir, "..", ".."),
    env: { ...cleanEnv(), PORT: "0", HOOK_LOG_FILE: logFile, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });

  // The server prints "harness-hooks listening on :<port>"; PORT=0 avoids picking a port ourselves.
  const reader = proc.stdout.getReader();
  const decoder = new TextDecoder();
  let seen = "";
  const deadline = Date.now() + 10_000;
  let port = 0;
  let host = "";
  while (!port) {
    if (Date.now() > deadline) {
      proc.kill();
      throw new Error(`server did not announce a port; output so far: ${seen}`);
    }
    const { value, done } = await reader.read();
    if (done) throw new Error(`server exited early; output: ${seen}`);
    seen += decoder.decode(value);
    const m = /listening on (\S*):(\d+)/.exec(seen);
    if (m) {
      host = m[1] ?? "";
      port = Number(m[2]);
    }
  }
  reader.releaseLock();

  return {
    // The tests dial loopback whatever the server bound, except where a test passes its own host.
    base: `http://127.0.0.1:${port}`,
    host,
    port,
    logFile,
    async stop(signal = "SIGTERM") {
      proc.kill(signal);
      const code = await proc.exited;
      await rm(dir, { recursive: true, force: true });
      return code;
    },
    async stopKeepingLog(signal = "SIGTERM") {
      proc.kill(signal);
      return await proc.exited;
    },
    async cleanup() {
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
