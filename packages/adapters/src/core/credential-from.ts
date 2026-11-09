import { CredentialUnsupportedReason, type RunFailure } from "./failure.ts";
import { unsupportedFailure } from "./credential-plan.ts";
import type { CredentialOf, CredentialSpec } from "./credential.ts";
import { fail, type Result } from "./result.ts";

export const CredentialSpecField = {
  Credential: "credential",
  Mode: "mode",
} as const;

export const CredentialSpecNote = {
  NotObject: "credential must be an object with a string mode",
} as const;

export function isCredentialSpec(value: unknown): value is CredentialSpec {
  return typeof value === "object" && value !== null && !Array.isArray(value) && typeof Reflect.get(value, CredentialSpecField.Mode) === "string";
}

export function notSpecFailure(): RunFailure {
  return { kind: "invalid-config", message: CredentialSpecNote.NotObject, field: CredentialSpecField.Credential };
}

export function credentialFromSpec<I extends string>(
  modes: readonly string[],
  build: (spec: CredentialSpec) => Result<CredentialOf<I>, RunFailure>,
  spec: unknown,
): Result<CredentialOf<I>, RunFailure> {
  if (!isCredentialSpec(spec)) {
    return fail(notSpecFailure());
  }
  if (!modes.includes(spec.mode)) {
    return fail(unsupportedFailure(spec.mode, CredentialUnsupportedReason.UnknownMode));
  }
  return build(spec);
}
