import type { HarnessId } from "@stateforge-labs/harness-hooks";
import type { Engine } from "./capability.ts";
import type { CredentialEvidence, CredentialOf, PolicyNotice } from "./credential.ts";
import type { RunFailure } from "./failure.ts";
import type { Result } from "./result.ts";
import type { SessionId } from "./session.ts";

export const Hermetic = { None: "none", Full: "full" } as const;
export type Hermetic = (typeof Hermetic)[keyof typeof Hermetic];

export const Isolation = { None: "none", PrivateHome: "private-home" } as const;
export type Isolation = (typeof Isolation)[keyof typeof Isolation];

export type IsolationSpec = { readonly kind: "none" } | { readonly kind: "private-home"; readonly retain: "delete" | "keep" };

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
  readonly basis: "list" | "unreported" | "unavailable";
}

export interface CommonOptions {
  readonly model?: string;
  readonly effort?: Effort;
  readonly timeoutMs?: number;
  readonly cwd?: string;
  readonly maxArgvBytes?: number;
  readonly hermetic?: Hermetic;
  readonly persist?: boolean;
  readonly signal?: AbortSignal;
  readonly limits?: Partial<Limits>;
}

export interface HeadlessOptions<I extends string = HarnessId> extends CommonOptions {
  readonly credential: CredentialOf<I>;
  readonly engine?: Engine;
  readonly isolation?: IsolationSpec;
  readonly acceptVersions?: readonly string[];
}

export interface RunRequest extends CommonOptions {
  readonly instructions: string;
  readonly input: string;
}

export interface RunOutput {
  readonly text: string;
  readonly usage: TokenUsage;
  readonly cost: Cost;
  readonly model: string | null;
  readonly sessionId: SessionId | null;
  readonly engine: Engine;
  readonly stability: "stable" | "experimental";
  readonly elapsedMs: number;
  readonly hermetic: Hermetic;
  readonly persisted: boolean;
  readonly isolationDir: string | null;
  readonly binary: { readonly path: string; readonly version: string | null; readonly source: "installed" | "bundled" };
  readonly cwd: string;
  readonly credential: CredentialEvidence;
}

export type RunEvent =
  | { readonly kind: "started"; readonly engine: Engine }
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "unrecognised"; readonly payload: unknown }
  | { readonly kind: "finished"; readonly result: Result<RunOutput, RunFailure> };

export const SpawnPurpose = { Run: "run", Version: "version", Help: "help" } as const;
export type SpawnPurpose = (typeof SpawnPurpose)[keyof typeof SpawnPurpose];

export type LibraryEvent =
  | { readonly kind: "spawn"; readonly harness: string; readonly engine: Engine; readonly purpose: SpawnPurpose; readonly argc: number }
  | { readonly kind: "exit"; readonly harness: string; readonly purpose: SpawnPurpose; readonly code: number | null; readonly signal: string | null; readonly durationMs: number; readonly outcome: "ok" | RunFailure["kind"] }
  | { readonly kind: "credential-plan"; readonly harness: string; readonly mode: string; readonly injected: readonly string[]; readonly stripped: readonly string[] }
  | { readonly kind: "engine-selected"; readonly harness: string; readonly engine: Engine }
  | { readonly kind: "isolation-created"; readonly harness: string; readonly retain: "delete" | "keep" }
  | { readonly kind: "isolation-removed"; readonly harness: string; readonly retain: "delete" | "keep" };

export interface Plan {
  readonly harness: string;
  readonly engine: Engine;
  readonly binary: string;
  readonly args: readonly string[];
  readonly stdinBytes: number;
  readonly argvCarries: readonly ("instructions" | "input")[];
  readonly env: { readonly inject: readonly string[]; readonly strip: readonly string[]; readonly set: readonly string[] };
  readonly options: Readonly<Record<string, unknown>>;
  readonly layers: Readonly<Record<string, "fact" | "consumer" | "call">>;
  readonly isolation: IsolationSpec;
  readonly notes: readonly string[];
}
