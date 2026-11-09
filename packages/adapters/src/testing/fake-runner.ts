import { Buffer } from "node:buffer";
import type { ProcessExit, ProcessRunner, ProcessSpec, RunningProcess } from "../driver/ports.ts";
import { Encoding, Signal, SpawnCode } from "../driver/constants.ts";
import { fail, ok } from "../core/result.ts";

export interface FakeProcessScript {
  readonly stdout?: string;
  readonly stderr?: string;
  readonly code?: number | null;
  readonly signal?: string | null;
  readonly hold?: boolean;
  readonly ignoreTerm?: boolean;
  readonly pipesOutliveExit?: boolean;
}

export interface FakeProcessRunner {
  readonly runner: ProcessRunner;
  readonly specs: readonly ProcessSpec[];
  readonly signals: readonly Signal[];
  release(index: number): void;
}

const FAKE = {
  Exhausted: "fake process script exhausted",
  DefaultCode: 0,
  PidBase: 40_000,
} as const;

interface Launched {
  readonly running: RunningProcess;
  release(): void;
}

async function* streamOf(text: string | undefined, done: Promise<void>): AsyncGenerator<Uint8Array> {
  if (text !== undefined && text !== "") {
    yield Buffer.from(text, Encoding.Utf8);
  }
  await done;
}

function launch(script: FakeProcessScript, index: number, signals: Signal[]): Launched {
  let finish: (exit: ProcessExit) => void = () => {};
  const exited = new Promise<ProcessExit>((resolve) => {
    finish = resolve;
  });
  let closeStreams: () => void = () => {};
  const streamsDone = new Promise<void>((resolve) => {
    closeStreams = resolve;
  });
  let done = false;
  const end = (exit: ProcessExit): void => {
    if (done) {
      return;
    }
    done = true;
    finish(exit);
    if (script.pipesOutliveExit !== true) {
      closeStreams();
    }
  };
  const normal = (): ProcessExit => ({
    code: script.code === undefined ? FAKE.DefaultCode : script.code,
    signal: script.signal ?? null,
  });
  if (script.hold !== true) {
    end(normal());
  }
  const running: RunningProcess = {
    pid: FAKE.PidBase + index,
    stdout: streamOf(script.stdout, streamsDone),
    stderr: streamOf(script.stderr, streamsDone),
    exited,
    signalGroup(signal) {
      signals.push(signal);
      if (signal === Signal.Kill) {
        end({ code: null, signal });
        closeStreams();
        return;
      }
      if (script.ignoreTerm !== true) {
        end({ code: null, signal });
      }
    },
  };
  return { running, release: () => end(normal()) };
}

export function fakeProcessRunner(scripts: readonly FakeProcessScript[]): FakeProcessRunner {
  const specs: ProcessSpec[] = [];
  const signals: Signal[] = [];
  const launched: Launched[] = [];
  const runner: ProcessRunner = async (spec) => {
    specs.push(spec);
    const index = specs.length - 1;
    const script = scripts[index];
    if (script === undefined) {
      return fail({ code: SpawnCode.SpawnFailed, message: FAKE.Exhausted });
    }
    const started = launch(script, index, signals);
    launched[index] = started;
    return ok(started.running);
  };
  return {
    runner,
    specs,
    signals,
    release(index) {
      launched[index]?.release();
    },
  };
}
