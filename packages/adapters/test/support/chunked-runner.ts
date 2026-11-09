import { Buffer } from "node:buffer";
import { SpawnCode } from "../../src/driver/constants.ts";
import type { ProcessExit, ProcessRunner, ProcessSpec, RunningProcess } from "../../src/driver/ports.ts";
import { fail, ok } from "../../src/core/result.ts";

export interface ChunkScript {
  readonly chunks: readonly string[];
  readonly stderr?: string;
  readonly code?: number;
}

export interface ChunkedRunner {
  readonly runner: ProcessRunner;
  readonly specs: ProcessSpec[];
}

const EXHAUSTED = "chunked runner script exhausted";
const NO_SIGNAL = null;

async function* yieldAll(parts: readonly string[]): AsyncGenerator<Uint8Array> {
  for (const part of parts) {
    yield Buffer.from(part, "utf8");
  }
}

export function chunkedRunner(scripts: readonly ChunkScript[]): ChunkedRunner {
  const specs: ProcessSpec[] = [];
  const runner: ProcessRunner = async (spec) => {
    specs.push(spec);
    const script = scripts[specs.length - 1];
    if (script === undefined) {
      return fail({ code: SpawnCode.SpawnFailed, message: EXHAUSTED });
    }
    const exit: ProcessExit = { code: script.code ?? 0, signal: NO_SIGNAL };
    const running: RunningProcess = {
      pid: null,
      stdout: yieldAll(script.chunks),
      stderr: yieldAll(script.stderr === undefined ? [] : [script.stderr]),
      exited: Promise.resolve(exit),
      signalGroup() {},
    };
    return ok(running);
  };
  return { runner, specs };
}
