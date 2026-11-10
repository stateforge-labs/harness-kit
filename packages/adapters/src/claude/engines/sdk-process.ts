import { spawn, type ChildProcess } from "node:child_process";
import { AgentTree } from "../../agent/constants.ts";
import type { Clock } from "../../core/io.ts";
import { tailBytes } from "../../core/limits.ts";
import type { ClaudeSpawnRequest } from "./sdk-options.ts";
import { SdkProcess } from "./sdk-constants.ts";

export interface ProcessTree {
  readonly spawn: (request: ClaudeSpawnRequest) => ChildProcess;
  kill(): Promise<void>;
  reap(): Promise<AgentTree>;
  stderrTail(): string;
}

export interface ProcessTreeDeps {
  readonly platform: string;
  readonly clock: Clock;
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

function pause(clock: Clock, ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    clock.after(ms, resolve);
  });
}

export function defaultTreeDeps(clock: Clock): ProcessTreeDeps {
  return { platform: process.platform, clock, killAfterMs: SdkProcess.KillAfterMs, giveUpMs: SdkProcess.GiveUpMs };
}

export function processTree(deps: ProcessTreeDeps): ProcessTree {
  let leader: ChildProcess | null = null;
  let tail = "";
  let killed = false;
  const grouped = deps.platform !== SdkProcess.WindowsPlatform;
  const kill = async (pid: number): Promise<void> => {
    if (!killed) {
      killed = true;
      await signal(pid, SdkProcess.Signal.Kill);
    }
  };
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
    async kill() {
      const pid = leader?.pid;
      if (pid !== undefined && grouped) {
        await kill(pid);
      }
    },
    async reap() {
      const pid = leader?.pid;
      if (pid === undefined) {
        return AgentTree.Gone;
      }
      if (!grouped) {
        return AgentTree.Unconfirmed;
      }
      const started = deps.clock.now();
      while (await alive(pid)) {
        const waited = deps.clock.now() - started;
        if (waited >= deps.giveUpMs) {
          return AgentTree.Unconfirmed;
        }
        if (waited >= deps.killAfterMs) {
          await kill(pid);
        }
        await pause(deps.clock, SdkProcess.PollMs);
      }
      return AgentTree.Gone;
    },
    stderrTail: () => tail,
  };
}
