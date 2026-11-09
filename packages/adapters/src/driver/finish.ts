import type { CredentialEvidence } from "../core/credential.ts";
import type { CredentialPlan } from "../core/credential-plan.ts";
import { type RunFailure, UnavailableReason } from "../core/failure.ts";
import { redactValue } from "../core/redact.ts";
import { ConfigField, EnvFieldName, HandleMessage, SuperviseMessage } from "./constants.ts";

export function redactFailure(failure: RunFailure, redact: (text: string) => string): RunFailure {
  return redactValue(failure, redact) as RunFailure;
}

export function closedFailure(): RunFailure {
  return { kind: "unavailable", message: HandleMessage.RuntimeClosed, reason: UnavailableReason.RuntimeClosed };
}

export function unknownFailure(id: string): RunFailure {
  return { kind: "unknown-harness", message: HandleMessage.UnknownHarness, id };
}

export function abortedFailure(): RunFailure {
  return { kind: "aborted", message: SuperviseMessage.Aborted };
}

export function scratchFailure(): RunFailure {
  return { kind: "unavailable", message: HandleMessage.ScratchFailed, reason: UnavailableReason.ScratchFailed };
}

export function binaryMissing(): RunFailure {
  return { kind: "unavailable", message: SuperviseMessage.BinaryMissing, reason: UnavailableReason.BinaryMissing };
}

export function helpUnavailable(): RunFailure {
  return { kind: "unavailable", message: HandleMessage.HelpUnavailable, reason: UnavailableReason.SpawnFailed };
}

export function noResult(): RunFailure {
  return { kind: "unavailable", message: HandleMessage.NoResult, reason: UnavailableReason.InternalError };
}

export function envFailure(): RunFailure {
  return { kind: "invalid-config", message: HandleMessage.EnvTransform, field: ConfigField.Env };
}

export function envPathFailure(): RunFailure {
  return { kind: "invalid-config", message: HandleMessage.EnvPathMissing, field: EnvFieldName.SetPath };
}

export function driversFailure(): RunFailure {
  return { kind: "invalid-config", message: HandleMessage.DriversThrew, field: ConfigField.Drivers };
}

export function credentialEvidence(plan: CredentialPlan, scrubbed: readonly string[]): CredentialEvidence {
  return {
    requested: plan.mode,
    scrubbed,
    billing: plan.billing,
    acknowledgement: plan.acknowledgement,
  };
}
