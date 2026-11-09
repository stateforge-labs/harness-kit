import type { CredentialSpec, OpenCodeCredential } from "../core/credential.ts";
import { CredentialField, CredentialMode, credentialFailure, finish, homeFailure, isPrivateHome, NO_INJECTION, secretOf, unsupportedFailure, type CredentialPlan, type CredentialPlanInput, type Injection } from "../core/credential-plan.ts";
import { credentialFromSpec, isCredentialSpec, notSpecFailure } from "../core/credential-from.ts";
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

const OPENCODE_MODES: readonly string[] = [CredentialMode.ApiKey, CredentialMode.LoginStore];

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
  const candidate: unknown = input.credential;
  if (!isCredentialSpec(candidate)) {
    return fail(notSpecFailure());
  }
  const spec: CredentialSpec = candidate;
  return finish(spec.mode, OPENCODE_CREDENTIAL_VARS, openCodeInjection(spec, input.isolation), null);
}

function requiredProvider(provider: unknown): Result<string, RunFailure> {
  if (typeof provider !== "string" || provider === "") {
    return fail(credentialFailure(CredentialReason.MissingField, CredentialField.Provider));
  }
  return ok(provider);
}

function openCodeCredentialOf(spec: CredentialSpec): Result<OpenCodeCredential, RunFailure> {
  switch (spec.mode) {
    case CredentialMode.ApiKey: {
      const key = secretOf(spec.key, CredentialField.Key);
      if (!key.ok) {
        return fail(key.failure);
      }
      const provider = requiredProvider(spec.provider);
      return provider.ok ? ok({ mode: CredentialMode.ApiKey, key: key.value, provider: provider.value }) : fail(provider.failure);
    }
    case CredentialMode.LoginStore:
      if (spec.provider === undefined) {
        return ok({ mode: CredentialMode.LoginStore });
      }
      const provider = requiredProvider(spec.provider);
      return provider.ok ? ok({ mode: CredentialMode.LoginStore, provider: provider.value }) : fail(provider.failure);
    default:
      return fail(unsupportedFailure(spec.mode, CredentialUnsupportedReason.UnknownMode));
  }
}

export function credentialFromOpencode(spec: unknown): Result<OpenCodeCredential, RunFailure> {
  return credentialFromSpec<"opencode">(OPENCODE_MODES, openCodeCredentialOf, spec);
}
