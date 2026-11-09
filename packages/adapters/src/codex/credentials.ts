import type { CodexCredential, CredentialSpec } from "../core/credential.ts";
import { CredentialField, CredentialMode, finish, homeFailure, isPrivateHome, NO_INJECTION, secretInjection, secretOf, unsupportedFailure, type CredentialPlan, type CredentialPlanInput, type Injection } from "../core/credential-plan.ts";
import { credentialFromSpec, isCredentialSpec, notSpecFailure } from "../core/credential-from.ts";
import { CredentialUnsupportedReason, type RunFailure } from "../core/failure.ts";
import { fail, ok, type Result } from "../core/result.ts";
import type { IsolationSpec } from "../core/run.ts";
import { EnvVar } from "../env.ts";
import { CODEX_CREDENTIAL_VARS } from "../core/credential-vars.ts";

const CODEX_MODES: readonly string[] = [CredentialMode.ApiKey, CredentialMode.LoginStore];

function codexInjection(spec: CredentialSpec, isolation: IsolationSpec): Result<Injection, RunFailure> {
  switch (spec.mode) {
    case CredentialMode.ApiKey:
      return secretInjection(spec.key, CredentialField.Key, EnvVar.CodexApiKey);
    case CredentialMode.LoginStore:
      return isPrivateHome(isolation) ? fail(unsupportedFailure(spec.mode, CredentialUnsupportedReason.PrivateHomeNoAuthCopy)) : ok(NO_INJECTION);
    default:
      return fail(unsupportedFailure(spec.mode, CredentialUnsupportedReason.UnknownMode));
  }
}

export function codexCredentialPlan(input: CredentialPlanInput<"codex">): Result<CredentialPlan, RunFailure> {
  const home = homeFailure(input.env);
  if (home !== null) {
    return fail(home);
  }
  const candidate: unknown = input.credential;
  if (!isCredentialSpec(candidate)) {
    return fail(notSpecFailure());
  }
  const spec: CredentialSpec = candidate;
  return finish(spec.mode, CODEX_CREDENTIAL_VARS, codexInjection(spec, input.isolation), null);
}

function codexCredentialOf(spec: CredentialSpec): Result<CodexCredential, RunFailure> {
  switch (spec.mode) {
    case CredentialMode.ApiKey: {
      const key = secretOf(spec.key, CredentialField.Key);
      return key.ok ? ok({ mode: CredentialMode.ApiKey, key: key.value }) : fail(key.failure);
    }
    case CredentialMode.LoginStore:
      return ok({ mode: CredentialMode.LoginStore });
    default:
      return fail(unsupportedFailure(spec.mode, CredentialUnsupportedReason.UnknownMode));
  }
}

export function credentialFromCodex(spec: unknown): Result<CodexCredential, RunFailure> {
  return credentialFromSpec<"codex">(CODEX_MODES, codexCredentialOf, spec);
}

export { CODEX_CREDENTIAL_VARS };
