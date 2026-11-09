import type { RunFailure } from "../../src/core/failure.ts";
import { fail, type Result } from "../../src/core/result.ts";
import { DEFAULT_LIMITS } from "../../src/driver/constants.ts";
import type { EngineEvent, EngineImpl, EngineIo, EngineRunInput } from "../../src/driver/engine.ts";
import { foldEnd, foldStart, foldStep } from "../../src/driver/fold.ts";
import type { ParsedRun, ProcessExit } from "../../src/driver/port.ts";
import type { ProcessRunner } from "../../src/driver/ports.ts";
import { chunkedRunner, type ChunkScript } from "./chunked-runner.ts";
import { fakeClock, fakeFs } from "./fakes.ts";

export interface InterpretRaw {
  readonly stdout: string;
  readonly stderrTail: string;
  readonly exit: ProcessExit;
  readonly outFileText: string | null;
  readonly requestedModel: string | null;
}

export interface Interpreted {
  readonly events: readonly EngineEvent[];
  readonly result: Result<ParsedRun, RunFailure>;
}

const OUT_FILE = "/work/out.txt";

export function idleRunner(): ProcessRunner {
  return () => Promise.resolve(fail({ code: "spawn-failed", message: "no spawn expected" }));
}

export function ioWith(runner: ProcessRunner, files: Record<string, string> = {}): EngineIo {
  return { runner, clock: fakeClock(0), fs: fakeFs({ files }), sleep: () => Promise.resolve() };
}

export function runInput(overrides: Partial<EngineRunInput> = {}): EngineRunInput {
  return {
    program: "engine",
    invocation: { program: "engine", args: [], stdin: null, outFile: null, argvCarries: [] },
    env: {},
    cwd: "/work",
    signal: undefined,
    timeoutMs: undefined,
    limits: DEFAULT_LIMITS,
    redact: (text) => text,
    requestedModel: null,
    outFile: null,
    ...overrides,
  };
}

export async function interpretEvents(engine: EngineImpl<string>, raw: InterpretRaw, extra: readonly ChunkScript[] = []): Promise<Interpreted> {
  const script: ChunkScript = { chunks: [raw.stdout], stderr: raw.stderrTail, code: raw.exit.code ?? 0 };
  const files: Record<string, string> = raw.outFileText === null ? {} : { [OUT_FILE]: raw.outFileText };
  const io = ioWith(chunkedRunner([script, ...extra]).runner, files);
  const run = engine.start(runInput({ requestedModel: raw.requestedModel, outFile: raw.outFileText === null ? null : OUT_FILE }), io);
  const events: EngineEvent[] = [];
  for await (const event of run.events) {
    events.push(event);
  }
  const done = await run.done;
  if (!done.ok) {
    return { events, result: fail(done.failure) };
  }
  const folded = events.reduce(foldStep, foldStart());
  return { events, result: foldEnd(folded, done.value, raw.requestedModel) };
}

export async function interpretRaw(engine: EngineImpl<string>, raw: InterpretRaw): Promise<Result<ParsedRun, RunFailure>> {
  return (await interpretEvents(engine, raw)).result;
}
