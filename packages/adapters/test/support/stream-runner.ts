import { Buffer } from "node:buffer";
import { Signal } from "../../src/driver/constants.ts";
import type { ProcessExit, ProcessRunner, RunningProcess } from "../../src/driver/ports.ts";
import { ok } from "../../src/core/result.ts";

export const STREAM_CHUNK_BYTES = 65_536;
const LINE_DIGITS = 10;
const LINE_PREFIX = "line-";
const LINE_FILL = "x";

export interface StreamRunner {
  readonly runner: ProcessRunner;
  readonly signals: Signal[];
  lastLine(): string;
}

export interface StreamRunnerOptions {
  readonly totalBytes: number;
  readonly newlines: boolean;
}

function lineOf(index: number): string {
  return `${LINE_PREFIX}${String(index).padStart(LINE_DIGITS, "0")}\n`;
}

export function streamRunner(options: StreamRunnerOptions): StreamRunner {
  const signals: Signal[] = [];
  let terminated = false;
  let last = "";
  let finish: (code: number | null) => void = () => {};
  const exited = new Promise<ProcessExit>((resolve) => {
    finish = (code) => resolve({ code, signal: code === null ? Signal.Term : null });
  });

  async function* stdout(): AsyncGenerator<Uint8Array> {
    const lineBytes = lineOf(0).length;
    let emitted = 0;
    let index = 0;
    while (emitted < options.totalBytes && !terminated) {
      const size = Math.min(STREAM_CHUNK_BYTES, options.totalBytes - emitted);
      if (options.newlines) {
        const lines: string[] = [];
        for (let used = 0; used < size; used += lineBytes) {
          last = lineOf(index);
          lines.push(last);
          index += 1;
        }
        yield Buffer.from(lines.join(""));
      } else {
        yield Buffer.from(LINE_FILL.repeat(size));
      }
      emitted += size;
    }
    finish(terminated ? null : 0);
  }

  async function* stderr(): AsyncGenerator<Uint8Array> {}

  const runner: ProcessRunner = async () => {
    const running: RunningProcess = {
      pid: null,
      stdout: stdout(),
      stderr: stderr(),
      exited,
      signalGroup(signal) {
        signals.push(signal);
        terminated = true;
        finish(null);
      },
    };
    return ok(running);
  };
  return { runner, signals, lastLine: () => last };
}
