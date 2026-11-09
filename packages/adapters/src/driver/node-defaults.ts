import { type ChildProcess, spawn } from "node:child_process";
import { Buffer } from "node:buffer";
import { constants as fsConstants } from "node:fs";
import { access, chmod, mkdtemp, open, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { type Clock, type DirEntryInfo, type RuntimeFs } from "../core/io.ts";
import { fail, ok, type Result } from "../core/result.ts";
import {
  DIR_MODE,
  Encoding,
  OpenFlag,
  Platform,
  PROCESS_DRAIN_GRACE_MS,
  ProcessEvent,
  Signal,
  SpawnCode,
  Stdio,
  SystemCode,
} from "./constants.ts";
import type { ProcessExit } from "./port.ts";
import type { ProcessRunner, ProcessSpec, RunningProcess, SpawnError } from "./ports.ts";

type Emitter = { on(event: string, listener: (...args: never[]) => void): unknown };

const ignore = (): void => {};

function errorCode(error: unknown): string {
  return typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function spawnFailure(error: unknown): SpawnError {
  const code = errorCode(error);
  const kind = code === SystemCode.NoEntry ? SpawnCode.NotFound : code === SystemCode.TooBig ? SpawnCode.ArgvTooBig : SpawnCode.SpawnFailed;
  return { code: kind, message: errorMessage(error) };
}

function startChild(spec: ProcessSpec): Result<ChildProcess, SpawnError> {
  try {
    return ok(
      spawn(spec.program, [...spec.args], {
        cwd: spec.cwd,
        env: { ...spec.env },
        detached: true,
        stdio: [Stdio.Pipe, Stdio.Pipe, Stdio.Pipe],
      }),
    );
  } catch (error) {
    return fail(spawnFailure(error));
  }
}

function sendOne(pid: number, signal: Signal): void {
  try {
    process.kill(pid, signal);
  } catch {
    return;
  }
}

function sendGroup(pid: number, signal: Signal): void {
  try {
    process.kill(-pid, signal);
  } catch {
    sendOne(pid, signal);
  }
}

function streamClosed(stream: Readable | null): Promise<void> {
  if (stream === null) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    stream.once(ProcessEvent.Close, () => resolve());
    stream.on(ProcessEvent.Error, ignore);
  });
}

export async function* chunksOf(stream: Readable | null): AsyncGenerator<Uint8Array> {
  if (stream === null) {
    return;
  }
  try {
    for await (const chunk of stream) {
      yield chunk;
    }
  } catch {
    return;
  }
}

export function nodeRunner(platform: string = defaultPlatform()): ProcessRunner {
  return (spec) =>
    new Promise<Result<RunningProcess, SpawnError>>((resolve) => {
      const started = startChild(spec);
      if (!started.ok) {
        resolve(fail(started.failure));
        return;
      }
      const child = started.value;
      const emitter = child as unknown as Emitter;
      const stdout = child.stdout;
      const stderr = child.stderr;
      if (child.stdin !== null) {
        child.stdin.on(ProcessEvent.Error, ignore);
        if (spec.stdin === null) {
          child.stdin.end();
        } else {
          child.stdin.end(spec.stdin);
        }
      }

      let exitInfo: ProcessExit | null = null;
      let pipesClosed = false;
      let settled = false;
      let drainTimer: ReturnType<typeof setTimeout> | null = null;
      let resolveExit: (exit: ProcessExit) => void = ignore;
      const exited = new Promise<ProcessExit>((done) => {
        resolveExit = done;
      });

      Promise.all([streamClosed(stdout), streamClosed(stderr)]).then(() => {
        pipesClosed = true;
        if (drainTimer !== null) {
          clearTimeout(drainTimer);
        }
      });

      const signalGroup = (signal: Signal): void => {
        if (exitInfo !== null && pipesClosed) {
          return;
        }
        const pid = child.pid;
        if (pid === undefined || pid <= 0 || pid === process.pid) {
          return;
        }
        if (platform === Platform.Linux) {
          sendGroup(pid, signal);
        } else {
          sendOne(pid, signal);
        }
      };

      emitter.on(ProcessEvent.Exit, (code: number | null, signal: string | null) => {
        exitInfo = { code, signal };
        resolveExit(exitInfo);
        if (!pipesClosed) {
          drainTimer = setTimeout(() => {
            signalGroup(Signal.Kill);
            stdout?.destroy();
            stderr?.destroy();
          }, PROCESS_DRAIN_GRACE_MS);
        }
      });

      emitter.on(ProcessEvent.Spawn, () => {
        settled = true;
        resolve(
          ok({
            pid: child.pid ?? null,
            stdout: chunksOf(stdout),
            stderr: chunksOf(stderr),
            exited,
            signalGroup,
          }),
        );
      });
      emitter.on(ProcessEvent.Error, (error: unknown) => {
        if (!settled) {
          settled = true;
          resolve(fail(spawnFailure(error)));
        }
      });
    });
}

export const nodeFs: RuntimeFs = {
  async makeTempDir(prefix, parent) {
    try {
      const dir = await mkdtemp(join(parent, prefix));
      await chmod(dir, DIR_MODE);
      return dir;
    } catch {
      return null;
    }
  },
  async removeTree(path) {
    try {
      await rm(path, { recursive: true, force: true });
      return true;
    } catch {
      return false;
    }
  },
  async listDir(path) {
    try {
      const entries = await readdir(path, { withFileTypes: true });
      return await Promise.all(
        entries.map(async (entry): Promise<DirEntryInfo> => {
          const info = await stat(join(path, entry.name));
          return { name: entry.name, mtimeMs: info.mtimeMs, isDirectory: entry.isDirectory() };
        }),
      );
    } catch {
      return null;
    }
  },
  async exists(path) {
    try {
      await access(path, fsConstants.F_OK);
      return true;
    } catch {
      return false;
    }
  },
  async isExecutable(path) {
    try {
      const info = await stat(path);
      if (!info.isFile()) {
        return false;
      }
      await access(path, fsConstants.X_OK);
      return true;
    } catch {
      return false;
    }
  },
  async readText(path, maxBytes) {
    try {
      const handle = await open(path, OpenFlag.Read);
      try {
        const buffer = Buffer.alloc(maxBytes);
        const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
        return buffer.subarray(0, bytesRead).toString(Encoding.Utf8);
      } finally {
        await handle.close();
      }
    } catch {
      return null;
    }
  },
};

export const nodeClock: Clock = {
  now: () => Date.now(),
  after(ms, fn) {
    const handle = setTimeout(fn, ms);
    return () => clearTimeout(handle);
  },
};

export function defaultCwd(): string {
  return process.cwd();
}

export function defaultPlatform(): string {
  return process.platform;
}
