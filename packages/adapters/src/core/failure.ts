import type { Engine, Support } from "./capability.ts";
import type { PolicyNotice } from "./credential.ts";

export const CredentialReason = {
  NotASecret: "not-a-secret",
  HomeUnset: "home-unset",
  MissingField: "missing-field",
  EmptySecret: "empty-secret",
  UnknownSelector: "unknown-selector",
  ProviderUnmeasured: "provider-unmeasured",
} as const;
export type CredentialReason = (typeof CredentialReason)[keyof typeof CredentialReason];

export const CredentialUnsupportedReason = {
  UnknownMode: "unknown-mode",
  ModeNotOffered: "mode-not-offered",
  ModeNotAllowed: "mode-not-allowed",
  PrivateHomeMovesLogin: "private-home-moves-login",
  PrivateHomeNoAuthCopy: "private-home-no-auth-copy",
} as const;
export type CredentialUnsupportedReason = (typeof CredentialUnsupportedReason)[keyof typeof CredentialUnsupportedReason];

export const UnavailableReason = {
  BinaryMissing: "binary-missing",
  SpawnFailed: "spawn-failed",
  VersionNotAccepted: "version-not-accepted",
  RuntimeClosed: "runtime-closed",
  InternalError: "internal-error",
  ScratchFailed: "scratch-failed",
  ScriptExhausted: "script-exhausted",
} as const;
export type UnavailableReason = (typeof UnavailableReason)[keyof typeof UnavailableReason];

/** Why a run did not produce an output; discriminate on kind and keep a default branch. */
export type RunFailure =
  | { readonly kind: "invalid-config"; readonly message: string; readonly field: string }
  | { readonly kind: "unknown-harness"; readonly message: string; readonly id: string }
  | { readonly kind: "credential"; readonly message: string; readonly reason: CredentialReason; readonly field: string }
  | { readonly kind: "credential-unsupported"; readonly message: string; readonly mode: string; readonly reason: CredentialUnsupportedReason }
  | { readonly kind: "policy-not-acknowledged"; readonly message: string; readonly notice: PolicyNotice }
  | { readonly kind: "credential-mismatch"; readonly message: string; readonly requested: string; readonly observed: string }
  | { readonly kind: "auth-rejected"; readonly message: string; readonly stderrTail: string }
  | { readonly kind: "timeout"; readonly message: string; readonly timeoutMs: number }
  | { readonly kind: "aborted"; readonly message: string }
  | { readonly kind: "exit"; readonly message: string; readonly code: number | null; readonly signal: string | null; readonly stderrTail: string }
  | { readonly kind: "unparsable"; readonly message: string; readonly reason: string }
  | { readonly kind: "unavailable"; readonly message: string; readonly reason: UnavailableReason }
  | { readonly kind: "too-large"; readonly message: string; readonly limitBytes: number; readonly actualBytes: number; readonly field: "instructions" | "input" | "environment" }
  | { readonly kind: "output-too-large"; readonly message: string; readonly limitBytes: number; readonly actualBytes: number }
  | { readonly kind: "unsupported"; readonly message: string; readonly capability: string; readonly engine: Engine; readonly why: string; readonly support?: Support }
  | { readonly kind: "cancelled"; readonly message: string }
  | { readonly kind: "max-turns"; readonly message: string; readonly turns: number }
  | { readonly kind: "no-output"; readonly message: string }
  | { readonly kind: "store-failed"; readonly message: string; readonly reason: string }
  | { readonly kind: "session-not-found"; readonly message: string; readonly sessionId: string };

export const RUN_FAILURE_KINDS = [
  "invalid-config",
  "unknown-harness",
  "credential",
  "credential-unsupported",
  "policy-not-acknowledged",
  "credential-mismatch",
  "auth-rejected",
  "timeout",
  "aborted",
  "exit",
  "unparsable",
  "unavailable",
  "too-large",
  "output-too-large",
  "unsupported",
  "cancelled",
  "max-turns",
  "no-output",
  "store-failed",
  "session-not-found",
] as const satisfies readonly RunFailure["kind"][];

type MissingKinds = Exclude<RunFailure["kind"], (typeof RUN_FAILURE_KINDS)[number]>;

export const RUN_FAILURE_KINDS_COMPLETE: [MissingKinds] extends [never] ? true : never = true;
