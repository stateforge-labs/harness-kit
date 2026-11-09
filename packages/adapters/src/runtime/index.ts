import { type HarnessId } from "@stateforge-labs/harness-hooks";
import { fail } from "../core/result.ts";
import type { RunEvent, RunRequest } from "../core/run.ts";
import type { RunFailure } from "../core/failure.ts";
import { buildRuntime, type Runtime } from "../driver/create-runtime.ts";
import { captureThrow } from "../driver/execute.ts";
import { driversFailure } from "../driver/finish.ts";
import type { HeadlessHandle } from "../driver/handle.ts";
import type { Drivers } from "../driver/port.ts";
import type { RuntimeConfig } from "../driver/ports.ts";
import { builtinDrivers } from "../drivers.ts";

export { Harness, type HarnessId } from "@stateforge-labs/harness-hooks";
export { Engine, UnsupportedReason, CapabilityName, isUsable, supportWhy, type AgentCell, type Capabilities, type Cell, type Support } from "../core/capability.ts";
export {
  ConfinementAxis,
  EnvKind,
  McpWhy,
  ToolSetting,
  TOOLS_DEFAULT,
  TOOLS_OFF,
  type ConfinementCell,
  type EnvPolicy,
  type McpEndpoint,
  type ToolPolicy,
} from "../core/policy.ts";
export { EvidenceKind, type EvidenceRef, type Measured, type Suggested } from "../core/evidence.ts";
export { ok, fail, type Result } from "../core/result.ts";
export {
  type ClaudeCredential,
  type CodexCredential,
  type CredentialByHarness,
  type CredentialEvidence,
  type CredentialOf,
  type CredentialSpec,
  type OpenCodeCredential,
  type PolicyNotice,
  type PolicyQuote,
} from "../core/credential.ts";
export { isSecret, secret, type Secret } from "../core/secret.ts";
export { type SessionId } from "../core/session.ts";
export {
  CredentialReason,
  CredentialUnsupportedReason,
  RUN_FAILURE_KINDS,
  UnavailableReason,
  type RunFailure,
} from "../core/failure.ts";
export {
  Hermetic,
  Isolation,
  SpawnPurpose,
  type Cost,
  type CliPlan,
  type CommonOptions,
  type CwdSpec,
  type Effort,
  type HeadlessOptions,
  type IsolationSpec,
  type LibraryEvent,
  type Limits,
  type Plan,
  type RunEvent,
  type RunOutput,
  type RunRequest,
  type SdkPlan,
  type TokenUsage,
} from "../core/run.ts";
export type { HeadlessHandle } from "../driver/handle.ts";
export type { Runtime } from "../driver/create-runtime.ts";
export * from "./experimental.ts";

function snapshotDrivers<H extends string>(drivers: Drivers<H>): Drivers<H> {
  const table = drivers as unknown as Readonly<Record<string, unknown>>;
  const entries = Object.keys(table).map((id) => [id, table[id]] as const);
  return Object.freeze(Object.fromEntries(entries)) as unknown as Drivers<H>;
}

function refusedHandle<I extends string>(id: I): HeadlessHandle<I> {
  const refused = (): RunFailure => driversFailure();
  async function* stream(_request: RunRequest): AsyncGenerator<RunEvent> {
    yield { kind: "finished", result: fail(refused()) };
  }
  return {
    id,
    plan: () => fail(refused()),
    run: () => Promise.resolve(fail(refused())),
    stream,
  };
}

function refusedRuntime<H extends string>(): Runtime<H> {
  const base = buildRuntime<H>(Object.freeze({}) as Drivers<H>, {});
  return Object.assign(Object.create(base) as Runtime<H>, { headless: <I extends H>(id: I) => refusedHandle<I>(id) });
}

/** Creates a runtime over the three built-in harnesses. */
export function createRuntime(config?: RuntimeConfig & { readonly drivers?: undefined }): Runtime<HarnessId>;
export function createRuntime<H extends string>(config: RuntimeConfig<H> & { readonly drivers: Drivers<H> }): Runtime<H>;
export function createRuntime(config?: RuntimeConfig): Runtime<HarnessId> {
  const built = captureThrow((): Runtime<HarnessId> => buildRuntime(snapshotDrivers(config?.drivers ?? builtinDrivers()), config ?? {}));
  return built.ok ? built.value : refusedRuntime<HarnessId>();
}
