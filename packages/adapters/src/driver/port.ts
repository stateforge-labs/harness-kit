import type { HarnessId } from "@stateforge-labs/harness-hooks";
import type { Capabilities, Engine } from "../core/capability.ts";
import type { CredentialOf, CredentialSpec, PolicyNotice } from "../core/credential.ts";
import type { CredentialPlan, CredentialPlanInput } from "../core/credential-plan.ts";
import type { RunFailure } from "../core/failure.ts";
import type { CredentialInspection, InspectIo } from "../core/inspect.ts";
import type { ResolvedTools } from "../core/policy.ts";
import type { Profile } from "../core/profile.ts";
import type { Result } from "../core/result.ts";
import type { Cost, TokenUsage } from "../core/run.ts";
import type { SessionId } from "../core/session.ts";
import type { ArgvCarry } from "../core/engine-constants.ts";
import type { ResolvedOptions } from "../core/raw-run.ts";
import type { AgentEngineImpl } from "../agent/engine.ts";
import type { EngineImpl } from "./engine.ts";

export type {
  AfterContext,
  BinaryFacts,
  CleanupContext,
  CliEngine,
  CliEngineParts,
  CliRunInput,
  EngineDescription,
  EngineEnd,
  EngineEvent,
  EngineHost,
  EngineImpl,
  EngineIo,
  EngineRun,
  EngineRunInput,
  Sleeper,
} from "./engine.ts";

export type { ProcessExit, ResolvedOptions } from "../core/raw-run.ts";

export interface EngineInput<I extends string> {
  readonly options: ResolvedOptions;
  readonly credential: CredentialOf<I>;
  readonly instructions: string;
  readonly input: string;
  readonly outFile: string;
  readonly runId: string;
}

export interface Invocation {
  readonly program: string;
  readonly args: readonly string[];
  readonly stdin: string | null;
  readonly outFile: string | null;
  readonly argvCarries: readonly (typeof ArgvCarry)[keyof typeof ArgvCarry][];
  readonly env?: Readonly<Record<string, string>>;
}

export interface PolicyInput {
  readonly tools: ResolvedTools;
  readonly credentialMode: string;
}

export interface PolicyApplied {
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}

export interface ParsedRun {
  readonly text: string;
  readonly usage: TokenUsage;
  readonly cost: Cost;
  readonly model: string | null;
  readonly sessionId: SessionId | null;
  readonly unrecognised: readonly unknown[];
}

export type Drivers<H extends string> = { readonly [K in H]: HarnessDriver<K> };

export interface RunFacet<I extends string> {
  readonly engines: readonly Engine[];
  readonly cli: EngineImpl<I>;
  readonly sdk?: EngineImpl<I>;
  readonly agent?: AgentEngineImpl<I>;
}

export interface CredentialFacet<I extends string> {
  readonly modes: readonly string[];
  readonly from: (spec: CredentialSpec) => Result<CredentialOf<I>, RunFailure>;
  readonly plan: (input: CredentialPlanInput<I>) => Result<CredentialPlan, RunFailure>;
  readonly policyNotice: (mode: string) => PolicyNotice | null;
  readonly inspect: (io: InspectIo) => Promise<Result<CredentialInspection, RunFailure>>;
}

export interface HarnessDriver<I extends string = HarnessId> {
  readonly id: I;
  readonly profile: Profile;
  readonly capabilities: Capabilities;
  readonly credentials: CredentialFacet<I>;
  readonly run: RunFacet<I>;
}
