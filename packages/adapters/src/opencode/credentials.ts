import type { CredentialSpec } from "../core/credential.ts";
import { CredentialField, CredentialMode, credentialFailure, finish, homeFailure, isPrivateHome, NO_INJECTION, secretOf, unsupportedFailure, type CredentialPlan, type CredentialPlanInput, type Injection } from "../core/credential-plan.ts";
import { CredentialReason, CredentialUnsupportedReason, type RunFailure } from "../core/failure.ts";
import { fail, ok, type Result } from "../core/result.ts";
import type { IsolationSpec } from "../core/run.ts";
import { EnvVar } from "../env.ts";
import { OpenCodeProviderEnv } from "./constants.ts";

export const OPENCODE_CREDENTIAL_VARS: readonly string[] = [
  EnvVar.AnthropicApiKey,
  EnvVar.OpenAiApiKey,
  EnvVar.AzureOpenAiApiKey,
  EnvVar.OpenCodeApiKey,
  EnvVar.AwsBearerTokenBedrock,
  EnvVar.OpenCodeConfigContent,
];

function providerVar(provider: string | undefined): Result<string, RunFailure> {
  if (provider === undefined || provider === "") {
    return fail(credentialFailure(CredentialReason.MissingField, CredentialField.Provider));
  }
  const name = Object.hasOwn(OpenCodeProviderEnv, provider) ? OpenCodeProviderEnv[provider] : undefined;
  if (name === undefined) {
    return fail(credentialFailure(CredentialReason.ProviderUnmeasured, CredentialField.Provider));
  }
  return ok(name);
}

function openCodeInjection(spec: CredentialSpec, isolation: IsolationSpec): Result<Injection, RunFailure> {
  switch (spec.mode) {
    case CredentialMode.ApiKey: {
      const key = secretOf(spec.key, CredentialField.Key);
      if (!key.ok) {
        return fail(key.failure);
      }
      const name = providerVar(spec.provider);
      if (!name.ok) {
        return fail(name.failure);
      }
      return ok({ [name.value]: key.value });
    }
    case CredentialMode.LoginStore:
      return isPrivateHome(isolation) ? fail(unsupportedFailure(spec.mode, CredentialUnsupportedReason.PrivateHomeNoAuthCopy)) : ok(NO_INJECTION);
    default:
      return fail(unsupportedFailure(spec.mode, CredentialUnsupportedReason.UnknownMode));
  }
}

export function openCodeCredentialPlan(input: CredentialPlanInput<"opencode">): Result<CredentialPlan, RunFailure> {
  const home = homeFailure(input.env);
  if (home !== null) {
    return fail(home);
  }
  const spec: CredentialSpec = input.credential;
  return finish(spec.mode, OPENCODE_CREDENTIAL_VARS, openCodeInjection(spec, input.isolation), null);
}
