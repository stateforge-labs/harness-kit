import { Buffer } from "node:buffer";
import { delimiter, join } from "node:path";
import type { Clock, RuntimeFs } from "../core/io.ts";
import { parseVersion } from "../core/version.ts";
import { type EnvSource, EnvVar } from "../env.ts";
import { Encoding, ExitCode, ProbeOutcome, Signal, VERSION_OUTPUT_BYTES } from "./constants.ts";
import type { ProcessExit } from "./port.ts";
import type { ProcessRunner, RunningProcess } from "./ports.ts";

const EMPTY = "";
const noop = (): void => {};

export interface VersionIo {
  readonly spawn: ProcessRunner;
  readonly env: Readonly<Record<string, string>>;
  readonly cwd: string;
  readonly clock: Clock;
  readonly timeoutMs: number;
}

export interface ProbeResult {
  readonly outcome: ProbeOutcome;
  readonly text: string;
  readonly exit: ProcessExit | null;
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

async function readBounded(stream: AsyncIterable<Uint8Array>, maxBytes: number): Promise<string> {
  const parts: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of stream) {
    parts.push(chunk);
    total += chunk.byteLength;
    if (total >= maxBytes) {
      break;
    }
  }
  return Buffer.concat(parts).subarray(0, maxBytes).toString(Encoding.Utf8);
}

async function outputOf(proc: RunningProcess, maxBytes: number): Promise<{ readonly text: string; readonly exit: ProcessExit }> {
  void readBounded(proc.stderr, maxBytes);
  const [text, exit] = await Promise.all([readBounded(proc.stdout, maxBytes), proc.exited]);
  return { text, exit };
}

export async function probeOutput(path: string, args: readonly string[], io: VersionIo, maxBytes: number): Promise<ProbeResult> {
  const started = await io.spawn({ program: path, args, env: io.env, cwd: io.cwd, stdin: null });
  if (!started.ok) {
    return { outcome: ProbeOutcome.Unavailable, text: EMPTY, exit: null };
  }
  const proc = started.value;
  let cancel: () => void = noop;
  const timedOut = new Promise<null>((resolve) => {
    cancel = io.clock.after(io.timeoutMs, () => resolve(null));
  });
  const settled = await Promise.race([outputOf(proc, maxBytes), timedOut]);
  cancel();
  proc.signalGroup(Signal.Kill);
  if (settled === null) {
    return { outcome: ProbeOutcome.Timeout, text: EMPTY, exit: null };
  }
  if (settled.exit.code !== ExitCode.Success) {
    return { outcome: ProbeOutcome.Exit, text: EMPTY, exit: settled.exit };
  }
  return { outcome: ProbeOutcome.Ok, text: settled.text, exit: settled.exit };
}

export async function readVersion(path: string, versionArgs: readonly string[], io: VersionIo): Promise<string | null> {
  const probe = await probeOutput(path, versionArgs, io, VERSION_OUTPUT_BYTES);
  return probe.outcome === ProbeOutcome.Ok ? parseVersion(probe.text) : null;
}
