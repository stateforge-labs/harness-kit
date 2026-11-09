import type { RunFailure } from "../../src/core/failure.ts";
import { fail, type Result } from "../../src/core/result.ts";
import type { LibraryEvent } from "../../src/core/run.ts";
import { resolveTools, TOOLS_DEFAULT } from "../../src/core/policy.ts";
import { DEFAULT_LIMITS } from "../../src/driver/constants.ts";
import { ok } from "../../src/core/result.ts";
import type { CliRunInput, EngineEvent, EngineHost, EngineImpl, EngineIo, EngineRunInput } from "../../src/driver/engine.ts";
import { CLAUDE_PROFILE } from "../../src/claude/profile.ts";
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

const OUT_DIR = "/work";
const OUT_FILE = `${OUT_DIR}/last-message.txt`;

export function stubHost(events: LibraryEvent[] = []): EngineHost {
  return {
    emit: (event) => {
      events.push(event);
    },
    locate: (program) => Promise.resolve(`/bin/${program}`),
    version: () => Promise.resolve(ok(null)),
    help: () => Promise.resolve("--standalone"),
    scratch: () => Promise.resolve(OUT_DIR),
  };
}

export function idleRunner(): ProcessRunner {
  return () => Promise.resolve(fail({ code: "spawn-failed", message: "no spawn expected" }));
}

export function ioWith(runner: ProcessRunner, files: Record<string, string> = {}): EngineIo {
  return { runner, clock: fakeClock(0), fs: fakeFs({ files }), sleep: () => Promise.resolve() };
}

export function runInput<I extends string = string>(overrides: Partial<EngineRunInput<I>> = {}): EngineRunInput<I> {
  return {
    options: { model: null, effort: null, persist: true, maxArgvBytes: null, cwd: "/work", tools: resolveTools(TOOLS_DEFAULT, undefined) },
    credential: { mode: "login-store", acknowledgePolicy: true } as never,
    instructions: "",
    input: "go",
    runId: "run-1",
    profile: CLAUDE_PROFILE,
    env: {},
    injected: [],
    cwd: "/work",
    signal: undefined,
    timeoutMs: undefined,
    limits: DEFAULT_LIMITS,
    redact: (text) => text,
    requestedModel: null,
    host: stubHost(),
    ...overrides,
  };
}

export function cliRunInput(overrides: Partial<CliRunInput> = {}): CliRunInput {
  return {
    ...runInput(),
    program: "engine",
    invocation: { program: "engine", args: [], stdin: null, outFile: null, argvCarries: [] },
    outFile: null,
    binary: { path: "/bin/engine", version: null },
    ...overrides,
  };
}

export async function interpretEvents(engine: EngineImpl<string>, raw: InterpretRaw, extra: readonly ChunkScript[] = []): Promise<Interpreted> {
  const script: ChunkScript = { chunks: [raw.stdout], stderr: raw.stderrTail, code: raw.exit.code ?? 0 };
  const files: Record<string, string> = raw.outFileText === null ? {} : { [OUT_FILE]: raw.outFileText };
  const io = ioWith(chunkedRunner([script, ...extra]).runner, files);
  const run = engine.start(runInput({ requestedModel: raw.requestedModel }), io);
  const events: EngineEvent[] = [];
  for await (const event of run.events) {
    if (event.kind !== "started") {
      events.push(event);
    }
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
