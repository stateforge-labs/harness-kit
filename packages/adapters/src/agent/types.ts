import type { Pipeline } from "@stateforge-labs/harness-hooks";
import type { AgentCell, Support } from "../core/capability.ts";
import type { RunFailure } from "../core/failure.ts";
import type { JsonObject, JsonValue } from "../core/json.ts";
import type { EnvPolicy, ToolPolicy } from "../core/policy.ts";
import type { Result } from "../core/result.ts";
import type { Effort, RunEvent } from "../core/run.ts";
import type { Secret } from "../core/secret.ts";
import type { SessionId } from "../core/session.ts";
import type { AgentTree, HookPoint } from "./constants.ts";

/** The one credential an agent run accepts: an injected api key and the base URL it is valid for. */
export interface AgentCredential {
  readonly mode: "api-key";
  readonly key: Secret;
  readonly baseUrl: string;
}

/** Directories the consumer supplies. They are absolute, exist and are writable; the library creates none. */
export interface AgentDirs {
  readonly cwd: string;
  readonly home: string;
  readonly configDir: string;
  readonly tmpDir: string;
}

/** The closed form of the environment policy. */
export type ClosedEnv = Extract<EnvPolicy, { readonly kind: "closed" }>;

/** The launcher of the child process: an explicit path and runtime, or `null` to detect them once. */
export interface AgentBinary {
  readonly path: string | null;
  readonly runtime: "node" | "bun" | null;
}

/** What an agent facet needs before any run: credential, directories, tool and environment policy. */
export interface AgentOptions {
  readonly credential: AgentCredential;
  readonly dirs: AgentDirs;
  readonly tools: ToolPolicy;
  readonly env: ClosedEnv;
  readonly binary?: AgentBinary;
  readonly engine?: "sdk";
  readonly timeoutMs?: number;
  readonly idleTimeoutMs?: number;
  readonly signal?: AbortSignal;
}

/** One transcript entry the consumer mirrors. */
export interface StoreEntry {
  readonly uuid: string;
  readonly json: string;
}

/** A consumer-owned mirror of the session transcript. A rejection ends the run with `store-failed`. */
export interface TranscriptStore {
  append(key: string, entries: readonly StoreEntry[]): Promise<void>;
  load(key: string): Promise<readonly StoreEntry[] | null>;
  listSubkeys(key: string): Promise<readonly string[]>;
}

/** Where hook events go: the consumer's pipeline, and the socket of an endpoint the consumer runs. */
export interface HookTarget {
  readonly pipeline: Pipeline;
  readonly socket: { readonly path: string; readonly shimDir: string } | null;
}

/** Resume an earlier session; a session that is gone gets exactly one fresh run when `recoveryPrompt` is set. */
export interface AgentResume {
  readonly sessionId: SessionId;
  readonly checkpoint?: string;
  readonly recoveryPrompt?: string;
}

/** One agent run. `maxTurns` is required and has no library default. */
export interface AgentStart {
  readonly instructions: string;
  readonly prompt: string;
  readonly model?: string;
  readonly effort?: Effort;
  readonly maxTurns: number;
  readonly outputSchema?: JsonObject;
  readonly resume?: AgentResume;
  readonly hooks?: HookTarget;
  readonly store?: TranscriptStore;
}

/** Raw token counts of one model message. */
export interface TurnUsage {
  readonly turn: number;
  readonly model: string | null;
  readonly input: number;
  readonly cacheWrite: number;
  readonly cacheRead: number;
  readonly output: number;
}

/** What a finished agent run produced. Usage is raw; there is no cost field. */
export interface AgentOutput {
  readonly text: string;
  readonly output: JsonValue | null;
  readonly sessionId: SessionId | null;
  readonly checkpoint: string | null;
  readonly turns: number;
  readonly usage: readonly TurnUsage[];
  readonly model: string | null;
}

/** An event of an agent run. `finished` is last and unique; its `tree` is `unconfirmed` when the child process tree could not be confirmed gone before the engine gave up waiting. */
export type AgentEvent =
  | Exclude<RunEvent, { readonly kind: "finished" }>
  | { readonly kind: "recovered"; readonly reason: "session-not-found" }
  | { readonly kind: "finished"; readonly result: Result<AgentOutput, RunFailure>; readonly tree: AgentTree };

/** A running agent: its events, its settled result (never rejects) and a cancel that resolves after the terminal event. */
export interface AgentRun {
  readonly events: AsyncIterable<AgentEvent>;
  readonly settled: Promise<Result<AgentOutput, RunFailure>>;
  cancel(): Promise<void>;
}

/** An agent facet of one harness. */
export interface Agent {
  readonly capabilities: Readonly<Record<AgentCell, Support>>;
  readonly hooks: Readonly<Record<HookPoint, Support>>;
  start(start: AgentStart): AgentRun;
}
