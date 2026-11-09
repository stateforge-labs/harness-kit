import { EnvVar, type EnvSource } from "../env.ts";
import type { CredentialEvidence, CredentialOf, PolicyNotice } from "./credential.ts";
import { CredentialReason, CredentialUnsupportedReason, type RunFailure } from "./failure.ts";
import { fail, ok, type Result } from "./result.ts";
import { Isolation, type IsolationSpec } from "./run.ts";
import { isSecret, secretIsEmpty, type Secret } from "./secret.ts";

export const CredentialMode = {
  ApiKey: "api-key",
  LoginStore: "login-store",
  Token: "token",
  Cloud: "cloud",
} as const;
export type CredentialMode = (typeof CredentialMode)[keyof typeof CredentialMode];

export const CredentialField = {
  Key: "key",
  Token: "token",
  Provider: "provider",
  Selector: "selector",
} as const;

export const CredentialBilling = {
  PerToken: "per-token",
  Unverified: "unverified",
} as const;

export const CredentialValue = {
  Enabled: "1",
} as const;

export const CredentialNote = {
  PolicyNotAcknowledged: "this mode needs acknowledgePolicy set to true before any run",
} as const;

export const CredentialMessage: Readonly<Record<CredentialReason, string>> = {
  [CredentialReason.HomeUnset]: "HOME must be set to a non-empty path",
  [CredentialReason.NotASecret]: "credential value must be wrapped with secret()",
  [CredentialReason.MissingField]: "credential field is missing",
  [CredentialReason.EmptySecret]: "credential secret is empty",
  [CredentialReason.UnknownSelector]: "cloud selector is not a measured selector",
  [CredentialReason.ProviderUnmeasured]: "provider has no measured key variable",
};

export const CredentialUnsupportedMessage: Readonly<Record<CredentialUnsupportedReason, string>> = {
  [CredentialUnsupportedReason.UnknownMode]: "credential mode is not offered by this harness",
  [CredentialUnsupportedReason.ModeNotOffered]: "credential mode is not offered by this harness",
  [CredentialUnsupportedReason.ModeNotAllowed]: "credential mode is not allowed by this runtime",
  [CredentialUnsupportedReason.PrivateHomeMovesLogin]: "a private home would move the login store; use an injected credential",
  [CredentialUnsupportedReason.PrivateHomeNoAuthCopy]: "a private home has no auth copy; use an injected credential",
};

export type Injection = Readonly<Record<string, Secret | string>>;

export const NO_INJECTION: Injection = {};

export interface CredentialPlan {
  readonly mode: string;
  readonly strip: readonly string[];
  readonly inject: Injection;
  readonly acknowledgement: { readonly noticeRetrievedAt: string } | null;
  readonly billing: CredentialEvidence["billing"];
}

export interface CredentialPlanInput<I extends string> {
  readonly credential: CredentialOf<I>;
  readonly isolation: IsolationSpec;
  readonly env: EnvSource;
}

export function presentNames(source: EnvSource, names: readonly string[]): string[] {
  return names.filter((name) => {
    const value = source[name];
    return value !== undefined && value !== "";
  });
}

export function credentialFailure(reason: CredentialReason, field: string): RunFailure {
  return { kind: "credential", message: CredentialMessage[reason], reason, field };
}

export function unsupportedFailure(mode: string, reason: CredentialUnsupportedReason): RunFailure {
  return { kind: "credential-unsupported", message: CredentialUnsupportedMessage[reason], mode, reason };
}

export function policyFailure(notice: PolicyNotice): RunFailure {
  return { kind: "policy-not-acknowledged", message: CredentialNote.PolicyNotAcknowledged, notice };
}

export function homeFailure(env: EnvSource): RunFailure | null {
  const home = env[EnvVar.Home];
  return home === undefined || home === "" ? credentialFailure(CredentialReason.HomeUnset, EnvVar.Home) : null;
}

export function isPrivateHome(isolation: IsolationSpec): boolean {
  return isolation.kind === Isolation.PrivateHome;
}

export function secretOf(value: unknown, field: string): Result<Secret, RunFailure> {
  if (value === undefined) {
    return fail(credentialFailure(CredentialReason.MissingField, field));
  }
  if (!isSecret(value)) {
    return fail(credentialFailure(CredentialReason.NotASecret, field));
  }
  if (secretIsEmpty(value)) {
    return fail(credentialFailure(CredentialReason.EmptySecret, field));
  }
  return ok(value);
}

export function secretInjection(value: unknown, field: string, name: string): Result<Injection, RunFailure> {
  const secret = secretOf(value, field);
  if (!secret.ok) {
    return fail(secret.failure);
  }
  return ok({ [name]: secret.value });
}

export function finish(mode: string, strip: readonly string[], injection: Result<Injection, RunFailure>, notice: PolicyNotice | null): Result<CredentialPlan, RunFailure> {
  if (!injection.ok) {
    return fail(injection.failure);
  }
  return ok({
    mode,
    strip,
    inject: injection.value,
    acknowledgement: notice === null ? null : { noticeRetrievedAt: notice.retrievedAt },
    billing: mode === CredentialMode.ApiKey ? CredentialBilling.PerToken : CredentialBilling.Unverified,
  });
}
