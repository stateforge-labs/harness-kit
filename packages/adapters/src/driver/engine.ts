import type { RunFailure } from "../core/failure.ts";
import type { Clock, RuntimeFs } from "../core/io.ts";
import type { Result } from "../core/result.ts";
import type { Cost, Limits, TokenUsage } from "../core/run.ts";
import type { SessionId } from "../core/session.ts";
import type { EngineInput, Invocation, ProcessExit } from "./port.ts";
import type { ProcessRunner } from "./ports.ts";

export type EngineEvent =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "unrecognised"; readonly payload: unknown }
  | { readonly kind: "final"; readonly text: string }
  | { readonly kind: "usage"; readonly usage: TokenUsage }
  | { readonly kind: "cost"; readonly cost: Cost }
  | { readonly kind: "model"; readonly model: string }
  | { readonly kind: "session"; readonly id: SessionId }
  | { readonly kind: "failure"; readonly failure: RunFailure };

export type Sleeper = (ms: number) => Promise<void>;

export interface EngineIo {
  readonly runner: ProcessRunner;
  readonly clock: Clock;
  readonly fs: RuntimeFs;
  readonly sleep: Sleeper;
}

export interface EngineRunInput {
  readonly program: string;
  readonly invocation: Invocation;
  readonly env: Readonly<Record<string, string>>;
  readonly cwd: string;
  readonly signal: AbortSignal | undefined;
  readonly timeoutMs: number | undefined;
  readonly limits: Limits;
  readonly redact: (text: string) => string;
  readonly requestedModel: string | null;
  readonly outFile: string | null;
}

export interface EngineEnd {
  readonly exit: ProcessExit;
  readonly stderrTail: string;
}

export interface EngineRun {
  readonly events: AsyncIterable<EngineEvent>;
  cancel(): void;
  readonly done: Promise<Result<EngineEnd, RunFailure>>;
}

export interface EngineImpl<I extends string> {
  invocation(input: EngineInput<I>): Result<Invocation, RunFailure>;
  start(input: EngineRunInput, io: EngineIo): EngineRun;
  parseLine(line: string): readonly EngineEvent[];
  readonly helpArgs: readonly string[] | null;
  checkHelp(help: string): Result<null, RunFailure>;
}

export interface AfterContext {
  readonly input: EngineRunInput;
  readonly end: EngineEnd;
  readonly stdoutTail: string;
  readonly outFileText: string | null;
  readonly io: EngineIo;
}

export interface CliEngineParts<I extends string> {
  invocation(input: EngineInput<I>): Result<Invocation, RunFailure>;
  parseLine(line: string): readonly EngineEvent[];
  after?(ctx: AfterContext): Promise<readonly EngineEvent[]>;
  helpArgs?: readonly string[] | null;
  checkHelp?(help: string): Result<null, RunFailure>;
}
