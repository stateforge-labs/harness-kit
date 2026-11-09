import type { CredentialOf } from "../core/credential.ts";
import type { RunFailure } from "../core/failure.ts";
import type { Clock, RuntimeFs } from "../core/io.ts";
import type { Profile } from "../core/profile.ts";
import type { ResolvedOptions } from "../core/raw-run.ts";
import type { Result } from "../core/result.ts";
import type { Cost, LibraryEvent, Limits, TokenUsage } from "../core/run.ts";
import type { SessionId } from "../core/session.ts";
import type { EngineInput, Invocation, ProcessExit } from "./port.ts";
import type { ProcessRunner } from "./ports.ts";

export type EngineEvent =
  | { readonly kind: "started" }
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

export interface EngineHost {
  emit(event: LibraryEvent): void;
  locate(program: string): Promise<string | null>;
  version(path: string): Promise<Result<string | null, RunFailure>>;
  help(path: string, args: readonly string[]): Promise<string | null>;
  scratch(): Promise<string | null>;
}

export interface EngineRunInput<I extends string = string> {
  readonly options: ResolvedOptions;
  readonly credential: CredentialOf<I>;
  readonly instructions: string;
  readonly input: string;
  readonly runId: string;
  readonly profile: Profile;
  readonly env: Readonly<Record<string, string>>;
  readonly injected: readonly string[];
  readonly cwd: string;
  readonly signal: AbortSignal | undefined;
  readonly timeoutMs: number | undefined;
  readonly limits: Limits;
  readonly redact: (text: string) => string;
  readonly requestedModel: string | null;
  readonly host: EngineHost;
}

export interface CliRunInput<I extends string = string> extends EngineRunInput<I> {
  readonly program: string;
  readonly invocation: Invocation;
  readonly outFile: string | null;
  readonly binary: BinaryFacts;
}

export interface BinaryFacts {
  readonly path: string;
  readonly version: string | null;
}

export interface EngineEnd {
  readonly exit: ProcessExit;
  readonly stderrTail: string;
  readonly binary?: BinaryFacts | null;
}

export interface EngineRun {
  readonly events: AsyncIterable<EngineEvent>;
  cancel(): void;
  readonly done: Promise<Result<EngineEnd, RunFailure>>;
}

export type EngineDescription =
  | {
      readonly engine: "cli";
      readonly binary: string;
      readonly args: readonly string[];
      readonly stdinBytes: number;
      readonly argvCarries: readonly ("instructions" | "input")[];
      readonly env: readonly string[];
    }
  | { readonly engine: "sdk"; readonly entry: string; readonly env: readonly string[] };

export interface EngineImpl<I extends string> {
  start(input: EngineRunInput<I>, io: EngineIo): EngineRun;
  describe?(input: EngineInput<I>): Result<EngineDescription, RunFailure>;
  parseLine?(line: string): readonly EngineEvent[];
}

export interface CliEngine<I extends string> extends EngineImpl<I> {
  invocation(input: EngineInput<I>): Result<Invocation, RunFailure>;
  parseLine(line: string): readonly EngineEvent[];
  readonly helpArgs: readonly string[] | null;
  checkHelp(help: string): Result<null, RunFailure>;
}

export interface AfterContext {
  readonly input: CliRunInput;
  readonly end: EngineEnd;
  readonly stdoutTail: string;
  readonly outFileText: string | null;
  readonly io: EngineIo;
}

export interface CleanupContext {
  readonly input: CliRunInput;
  readonly io: EngineIo;
  readonly stdoutTail: string;
}

export interface CliEngineParts<I extends string> {
  invocation(input: EngineInput<I>): Result<Invocation, RunFailure>;
  parseLine(line: string): readonly EngineEvent[];
  after?(ctx: AfterContext): Promise<readonly EngineEvent[]>;
  cleanup?(ctx: CleanupContext): Promise<void>;
  helpArgs?: readonly string[] | null;
  checkHelp?(help: string): Result<null, RunFailure>;
}
