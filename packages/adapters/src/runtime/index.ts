import { type HarnessId } from "@stateforge-labs/harness-hooks";
import { buildRuntime, type Runtime } from "../driver/create-runtime.ts";
import { captureThrow } from "../driver/execute.ts";
import type { Drivers } from "../driver/port.ts";
import type { RuntimeConfig } from "../driver/ports.ts";
import { builtinDrivers } from "../drivers.ts";

export { Harness, type HarnessId } from "@stateforge-labs/harness-hooks";
export { Engine, UnsupportedReason, CapabilityName, type Capabilities, type Support } from "../core/capability.ts";
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
  type CommonOptions,
  type Effort,
  type HeadlessOptions,
  type IsolationSpec,
  type LibraryEvent,
  type Limits,
  type Plan,
  type RunEvent,
  type RunOutput,
  type RunRequest,
  type TokenUsage,
} from "../core/run.ts";
export type { HeadlessHandle } from "../driver/handle.ts";
export type { Runtime } from "../driver/create-runtime.ts";
export * from "./experimental.ts";

/** Creates a runtime over the three built-in harnesses. */
export function createRuntime(config?: RuntimeConfig & { readonly drivers?: undefined }): Runtime<HarnessId>;
export function createRuntime<H extends string>(config: RuntimeConfig<H> & { readonly drivers: Drivers<H> }): Runtime<H>;
export function createRuntime(config?: RuntimeConfig): Runtime<HarnessId> {
  const built = captureThrow((): Runtime<HarnessId> => buildRuntime(config?.drivers ?? builtinDrivers(), config ?? {}));
  return built.ok ? built.value : buildRuntime(builtinDrivers(), {});
}
