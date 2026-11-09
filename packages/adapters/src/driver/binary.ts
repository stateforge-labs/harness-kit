import { Buffer } from "node:buffer";
import { delimiter, join } from "node:path";
import type { Clock, RuntimeFs } from "../core/io.ts";
import { parseVersion } from "../core/version.ts";
import { type EnvSource, EnvVar } from "../env.ts";
import { Encoding, Signal, VERSION_OUTPUT_BYTES } from "./constants.ts";
import type { ProcessRunner, RunningProcess } from "./ports.ts";

const EMPTY = "";

export interface VersionIo {
  readonly spawn: ProcessRunner;
  readonly env: Readonly<Record<string, string>>;
  readonly cwd: string;
  readonly clock: Clock;
  readonly timeoutMs: number;
}

export async function locateBinary(name: string, env: EnvSource, fs: RuntimeFs): Promise<string | null> {
  const path = env[EnvVar.Path] ?? EMPTY;
  for (const dir of path.split(delimiter)) {
    if (dir === EMPTY) {
      continue;
    }
    const candidate = join(dir, name);
    if (await fs.isExecutable(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function readBounded(stream: AsyncIterable<Uint8Array>): Promise<string> {
  const parts: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of stream) {
    parts.push(chunk);
    total += chunk.byteLength;
    if (total >= VERSION_OUTPUT_BYTES) {
      break;
    }
  }
  return Buffer.concat(parts).subarray(0, VERSION_OUTPUT_BYTES).toString(Encoding.Utf8);
}

async function outputOf(proc: RunningProcess): Promise<string | null> {
  void readBounded(proc.stderr);
  const [text, exit] = await Promise.all([readBounded(proc.stdout), proc.exited]);
  return exit.code === 0 ? text : null;
}

export async function readVersion(path: string, versionArgs: readonly string[], io: VersionIo): Promise<string | null> {
  const started = await io.spawn({ program: path, args: versionArgs, env: io.env, cwd: io.cwd, stdin: null });
  if (!started.ok) {
    return null;
  }
  const proc = started.value;
  let cancel: () => void = () => {};
  const timedOut = new Promise<null>((resolve) => {
    cancel = io.clock.after(io.timeoutMs, () => resolve(null));
  });
  const output = await Promise.race([outputOf(proc), timedOut]);
  cancel();
  proc.signalGroup(Signal.Kill);
  return output === null ? null : parseVersion(output);
}
