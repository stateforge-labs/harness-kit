import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EnvVar, processEnv } from "@homelab/harness-hooks";

export const hookEnvNames = new Set<string>(Object.entries(EnvVar).filter(([name]) => /^(Hook|Shim|Plugin)/.test(name)).map(([, value]) => value));

function cleanEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...processEnv() };
  for (const k of Object.keys(env)) if (k === EnvVar.Port || hookEnvNames.has(k)) delete env[k];
  return env;
}

export interface RunningServer {
  base: string;
  host: string;
  port: number;
  logFile: string;
  stop(signal?: "SIGTERM" | "SIGINT"): Promise<number>;
  stopKeepingLog(signal?: "SIGTERM" | "SIGINT"): Promise<number>;
  cleanup(): Promise<void>;
}

export interface Refusal {
  code: number | null;
  stdout: string;
  stderr: string;
}

export async function refusesToStart(env: Record<string, string>, ms = 5000): Promise<Refusal> {
  const proc = Bun.spawn(["bun", "src/server.ts"], {
    cwd: join(import.meta.dir, "..", ".."),
    env: { ...cleanEnv(), [EnvVar.Port]: "0", [EnvVar.HookLogFile]: join(tmpdir(), "harness-hooks-refusal.jsonl"), ...env },
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
    env: { ...cleanEnv(), [EnvVar.Port]: "0", [EnvVar.HookLogFile]: logFile, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });

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

export async function eventually<T>(check: () => Promise<T | undefined>, ms = 3000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await check();
    if (v !== undefined) return v;
    if (Date.now() > end) throw new Error("condition not met in time");
    await Bun.sleep(25);
  }
}
