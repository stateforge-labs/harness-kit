import { spawn, type ChildProcess } from "node:child_process";
import { tailBytes } from "../../core/limits.ts";
import type { ClaudeSpawnRequest } from "./sdk-options.ts";
import { SdkProcess } from "./sdk-constants.ts";

export interface ProcessTree {
  readonly spawn: (request: ClaudeSpawnRequest) => ChildProcess;
  reap(): Promise<void>;
  stderrTail(): string;
}

export interface ProcessTreeDeps {
  readonly platform: string;
  readonly sleep: (ms: number) => Promise<void>;
  readonly now: () => number;
  readonly killAfterMs: number;
  readonly giveUpMs: number;
}

function alive(pid: number): Promise<boolean> {
  return Promise.resolve()
    .then(() => process.kill(-pid, SdkProcess.Signal.Probe))
    .then(
      () => true,
      () => false,
    );
}

function signal(pid: number, name: NodeJS.Signals): Promise<void> {
  return Promise.resolve()
    .then(() => {
      process.kill(-pid, name);
    })
    .then(undefined, () => undefined);
}

export function defaultTreeDeps(): ProcessTreeDeps {
  return {
    platform: process.platform,
    sleep: (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
    killAfterMs: SdkProcess.KillAfterMs,
    giveUpMs: SdkProcess.GiveUpMs,
  };
}

export function processTree(deps: ProcessTreeDeps): ProcessTree {
  let leader: ChildProcess | null = null;
  let tail = "";
  const grouped = deps.platform !== SdkProcess.WindowsPlatform;
  return {
    spawn(request) {
      const child = spawn(request.command, request.args, {
        cwd: request.cwd,
        env: request.env,
        stdio: [...SdkProcess.Stdio],
        detached: grouped,
        signal: request.signal,
        windowsHide: true,
      });
      leader = child;
      child.stderr?.on(SdkProcess.DataEvent, (chunk: Buffer) => {
        tail = tailBytes(tail + chunk.toString("utf8"), SdkProcess.StderrBytes);
      });
      return child;
    },
    async reap() {
      const pid = leader?.pid;
      if (pid === undefined || !grouped) {
        return;
      }
      const started = deps.now();
      let killed = false;
      while (await alive(pid)) {
        const waited = deps.now() - started;
        if (waited >= deps.giveUpMs) {
          return;
        }
        if (!killed && waited >= deps.killAfterMs) {
          killed = true;
          await signal(pid, SdkProcess.Signal.Kill);
        }
        await deps.sleep(SdkProcess.PollMs);
      }
    },
    stderrTail: () => tail,
  };
}
