import type { ConfinementCell } from "../core/policy.ts";
import type { RunFailure } from "../core/failure.ts";
import type { Result } from "../core/result.ts";
import type { SdkPlan } from "../core/run.ts";
import type { AgentEvent, AgentOptions, AgentOutput, AgentStart } from "./types.ts";

/** Everything an agent engine needs for one run. `env` is the only path a secret takes to the child. */
export interface AgentRunInput {
  readonly options: AgentOptions;
  readonly start: AgentStart;
  readonly env: Readonly<Record<string, string>>;
  readonly secrets: readonly string[];
  readonly confinement: readonly ConfinementCell[];
  readonly runId: string;
  readonly signal: AbortSignal;
  readonly redact: (text: string) => string;
}

/** How an engine run ended. */
export interface AgentEnd {
  readonly output: AgentOutput;
  readonly stderrTail: string;
}

/** A started engine run. Its events never carry `finished`; the facet adds it after `done`. */
export interface AgentEngineRun {
  readonly events: AsyncIterable<AgentEvent>;
  cancel(): void;
  readonly done: Promise<Result<AgentEnd, RunFailure>>;
}

/** The seam an SDK engine implements for one harness. */
export interface AgentEngineImpl<I extends string> {
  readonly harness: I;
  start(input: AgentRunInput): AgentEngineRun;
  describe(input: AgentRunInput): Result<SdkPlan, RunFailure>;
}
