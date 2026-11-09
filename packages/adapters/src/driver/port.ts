import type { CredentialOf } from "../core/credential.ts";
import type { RunFailure } from "../core/failure.ts";
import type { Result } from "../core/result.ts";
import type { Cost, Effort, Hermetic, IsolationSpec, TokenUsage } from "../core/run.ts";
import type { SessionId } from "../core/session.ts";
import type { ArgvCarry } from "./constants.ts";

export interface ResolvedOptions {
  readonly model: string | null;
  readonly effort: Effort | null;
  readonly hermetic: Hermetic;
  readonly persist: boolean;
  readonly maxArgvBytes: number | null;
  readonly cwd: string;
  readonly isolation: IsolationSpec;
}

export interface EngineInput<I extends string> {
  readonly options: ResolvedOptions;
  readonly credential: CredentialOf<I>;
  readonly instructions: string;
  readonly input: string;
  readonly outFile: string;
}

export interface Invocation {
  readonly program: string;
  readonly args: readonly string[];
  readonly stdin: string | null;
  readonly outFile: string | null;
  readonly argvCarries: readonly (typeof ArgvCarry)[keyof typeof ArgvCarry][];
}

export interface ProcessExit {
  readonly code: number | null;
  readonly signal: string | null;
}

export interface RawRun {
  readonly stdout: string;
  readonly stderrTail: string;
  readonly exit: ProcessExit;
  readonly outFileText: string | null;
  readonly requestedModel: string | null;
}

export interface ParsedRun {
  readonly text: string;
  readonly usage: TokenUsage;
  readonly cost: Cost;
  readonly model: string | null;
  readonly sessionId: SessionId | null;
  readonly unrecognised: readonly unknown[];
}

export interface CliEngine<I extends string> {
  invocation(input: EngineInput<I>): Result<Invocation, RunFailure>;
  interpret(raw: RawRun): Result<ParsedRun, RunFailure>;
  textOf(line: string): string | null;
  readonly helpArgs: readonly string[] | null;
  checkHelp(help: string): Result<null, RunFailure>;
}
