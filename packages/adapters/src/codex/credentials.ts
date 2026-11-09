import type { CredentialSpec } from "../core/credential.ts";
import { CredentialField, CredentialMode, finish, homeFailure, isPrivateHome, NO_INJECTION, secretInjection, unsupportedFailure, type CredentialPlan, type CredentialPlanInput, type Injection } from "../core/credential-plan.ts";
import { CredentialUnsupportedReason, type RunFailure } from "../core/failure.ts";
import { fail, ok, type Result } from "../core/result.ts";
import type { IsolationSpec } from "../core/run.ts";
import { EnvVar } from "../env.ts";

export const CODEX_CREDENTIAL_VARS: readonly string[] = [EnvVar.OpenAiApiKey, EnvVar.CodexApiKey];

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
  const spec: CredentialSpec = input.credential;
  return finish(spec.mode, CODEX_CREDENTIAL_VARS, codexInjection(spec, input.isolation), null);
}
