import type { HarnessId } from "@stateforge-labs/harness-hooks";
import type { ToolClass } from "../constants.ts";
import type { Engine } from "./capability.ts";
import type { CredentialEvidence, CredentialOf } from "./credential.ts";
import type { RunFailure } from "./failure.ts";
import type { JsonValue } from "./json.ts";
import type { ConfinementCell, EnvPolicy, ToolPolicy } from "./policy.ts";
import type { Result } from "./result.ts";
import type { SessionId } from "./session.ts";

export type Effort = "low" | "medium" | "high" | "harness-default" | { readonly native: string };

export interface Limits {
  readonly maxStdoutBytes: number;
  readonly maxStderrBytes: number;
}

export interface TokenUsage {
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly cacheReadTokens: number | null;
  readonly cacheWriteTokens: number | null;
  readonly reasoningTokens: number | null;
  readonly totalTokens: number | null;
}

export interface Cost {
  readonly usd: number | null;
  readonly basis: "billed" | "list" | "unreported" | "unavailable";
}

export type CwdSpec = string | { readonly private: "delete" | "keep" };

export interface CommonOptions {
  readonly model?: string;
  readonly effort?: Effort;
  readonly timeoutMs?: number;
  readonly cwd?: CwdSpec;
  readonly maxArgvBytes?: number;
  readonly persist?: boolean;
  readonly signal?: AbortSignal;
  readonly limits?: Partial<Limits>;
  readonly tools?: ToolPolicy;
  readonly env?: EnvPolicy;
}

export interface HeadlessOptions<I extends string = HarnessId> extends CommonOptions {
  readonly credential: CredentialOf<I>;
  readonly engine?: Engine;
}

export interface RunRequest extends CommonOptions {
  readonly instructions: string;
  readonly input: string;
}

/** The result of a successful headless run: text, usage, cost, session, engine, binary and the credential and confinement evidence. */
export interface RunOutput {
  readonly text: string;
  readonly usage: TokenUsage;
  readonly cost: Cost;
  readonly model: string | null;
  readonly sessionId: SessionId | null;
  readonly engine: Engine;
  readonly stability: "stable" | "experimental";
  readonly elapsedMs: number;
  readonly persisted: boolean;
  readonly binary: { readonly path: string; readonly version: string | null; readonly source: "installed" | "bundled" };
  readonly cwd: string;
  readonly credential: CredentialEvidence;
  readonly confinement: readonly ConfinementCell[];
}

export type RunEvent =
  | { readonly kind: "started"; readonly engine: Engine }
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "turn"; readonly n: number }
  | { readonly kind: "compacted" }
  | { readonly kind: "usage"; readonly turn: number; readonly model: string | null; readonly input: number; readonly cacheWrite: number; readonly cacheRead: number; readonly output: number }
  | { readonly kind: "session"; readonly id: SessionId; readonly checkpoint: string | null }
  | { readonly kind: "tool"; readonly id: string; readonly name: string; readonly class: ToolClass; readonly target: string | null }
  | { readonly kind: "refused"; readonly id: string; readonly tool: string; readonly source: "hook" | "unknown-tool"; readonly reason: string; readonly text: string | null }
  | { readonly kind: "output"; readonly value: JsonValue }
  | { readonly kind: "unrecognised"; readonly payload: unknown }
  | { readonly kind: "finished"; readonly result: Result<RunOutput, RunFailure> };

export const SpawnPurpose = { Run: "run", Version: "version", Help: "help" } as const;
export type SpawnPurpose = (typeof SpawnPurpose)[keyof typeof SpawnPurpose];

export type LibraryEvent =
  | { readonly kind: "spawn"; readonly harness: string; readonly engine: Engine; readonly purpose: SpawnPurpose; readonly argc: number }
  | { readonly kind: "exit"; readonly harness: string; readonly purpose: SpawnPurpose; readonly code: number | null; readonly signal: string | null; readonly durationMs: number; readonly outcome: "ok" | RunFailure["kind"] }
  | { readonly kind: "credential-plan"; readonly harness: string; readonly mode: string; readonly injected: readonly string[]; readonly stripped: readonly string[] }
  | { readonly kind: "engine-selected"; readonly harness: string; readonly engine: Engine }
  | { readonly kind: "cwd-created" | "cwd-removed"; readonly harness: string; readonly retain: "delete" | "keep" };

interface PlanBase {
  readonly harness: string;
  readonly options: Readonly<Record<string, unknown>>;
  readonly env: {
    readonly kind: "inherit" | "closed";
    readonly inject: readonly string[];
    readonly strip: readonly string[];
    readonly set: readonly string[];
  };
  readonly cwd: { readonly kind: "given" | "private"; readonly retain: "delete" | "keep" | null };
  readonly confinement: readonly ConfinementCell[];
  readonly notes: readonly string[];
}

/** The plan of a run on the CLI engine: binary, arguments, stdin size and which inputs travel in the arguments. */
export interface CliPlan extends PlanBase {
  readonly engine: "cli";
  readonly binary: string;
  readonly args: readonly string[];
  readonly stdinBytes: number;
  readonly argvCarries: readonly ("instructions" | "input")[];
}

/** The plan of a run on the SDK engine. */
export interface SdkPlan extends PlanBase {
  readonly engine: "sdk";
  readonly entry: string;
}

/** What a run would execute, for review before spawning: a CLI invocation or an SDK entry. */
export type Plan = CliPlan | SdkPlan;
