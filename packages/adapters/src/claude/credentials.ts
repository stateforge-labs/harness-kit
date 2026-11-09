import type { ClaudeCredential, CredentialSpec, PolicyNotice } from "../core/credential.ts";
import { CredentialField, CredentialMode, CredentialValue, credentialFailure, finish, homeFailure, NO_INJECTION, policyFailure, secretInjection, secretOf, unsupportedFailure, type CredentialPlan, type CredentialPlanInput, type Injection } from "../core/credential-plan.ts";
import { credentialFromSpec, isCredentialSpec, notSpecFailure } from "../core/credential-from.ts";
import { CredentialReason, CredentialUnsupportedReason, type RunFailure } from "../core/failure.ts";
import { fail, ok, type Result } from "../core/result.ts";
import { EnvVar } from "../env.ts";
import { ClaudeCloudEnv } from "./constants.ts";
import { claudePolicyNotice } from "./policy-notice.ts";
import { CLAUDE_CREDENTIAL_VARS } from "../core/credential-vars.ts";

const CLAUDE_MODES: readonly string[] = [CredentialMode.ApiKey, CredentialMode.LoginStore, CredentialMode.Token, CredentialMode.Cloud];

function cloudInjection(selector: string | undefined): Result<Injection, RunFailure> {
  const name = selector !== undefined && Object.hasOwn(ClaudeCloudEnv, selector) ? ClaudeCloudEnv[selector] : undefined;
  if (name === undefined) {
    return fail(credentialFailure(CredentialReason.UnknownSelector, CredentialField.Selector));
  }
  return ok({ [name]: CredentialValue.Enabled });
}

function apiKeyInjection(spec: CredentialSpec): Result<Injection, RunFailure> {
  const key = secretInjection(spec.key, CredentialField.Key, EnvVar.AnthropicApiKey);
  if (!key.ok || spec.baseUrl === undefined) {
    return key;
  }
  return ok({ ...key.value, [EnvVar.AnthropicBaseUrl]: spec.baseUrl });
}

function claudeInjection(spec: CredentialSpec): Result<Injection, RunFailure> {
  switch (spec.mode) {
    case CredentialMode.ApiKey:
      return apiKeyInjection(spec);
    case CredentialMode.Token:
      return secretInjection(spec.token, CredentialField.Token, EnvVar.ClaudeCodeOauthToken);
    case CredentialMode.LoginStore:
      return ok(NO_INJECTION);
    case CredentialMode.Cloud:
      return cloudInjection(spec.selector);
    default:
      return fail(unsupportedFailure(spec.mode, CredentialUnsupportedReason.UnknownMode));
  }
}

export function claudeCredentialPlan(input: CredentialPlanInput<"claude">): Result<CredentialPlan, RunFailure> {
  const home = homeFailure(input.env);
  if (home !== null) {
    return fail(home);
  }
  const candidate: unknown = input.credential;
  if (!isCredentialSpec(candidate)) {
    return fail(notSpecFailure());
  }
  const spec: CredentialSpec = candidate;
  const mode = spec.mode;
  const notice = claudePolicyNotice(mode);
  if (notice !== null && spec.acknowledgePolicy !== true) {
    return fail(policyFailure(notice));
  }
  return finish(mode, CLAUDE_CREDENTIAL_VARS, claudeInjection(spec), notice);
}

function policyGate(spec: CredentialSpec): Result<true, RunFailure> {
  const notice: PolicyNotice | null = claudePolicyNotice(spec.mode);
  if (notice !== null && spec.acknowledgePolicy !== true) {
    return fail(policyFailure(notice));
  }
  return ok(true);
}

function claudeCredentialOf(spec: CredentialSpec): Result<ClaudeCredential, RunFailure> {
  switch (spec.mode) {
    case CredentialMode.ApiKey: {
      const key = secretOf(spec.key, CredentialField.Key);
      if (!key.ok) {
        return fail(key.failure);
      }
      return ok(spec.baseUrl === undefined ? { mode: CredentialMode.ApiKey, key: key.value } : { mode: CredentialMode.ApiKey, key: key.value, baseUrl: spec.baseUrl });
    }
    case CredentialMode.LoginStore: {
      const gate = policyGate(spec);
      return gate.ok ? ok({ mode: CredentialMode.LoginStore, acknowledgePolicy: gate.value }) : fail(gate.failure);
    }
    case CredentialMode.Token: {
      const gate = policyGate(spec);
      if (!gate.ok) {
        return fail(gate.failure);
      }
      const token = secretOf(spec.token, CredentialField.Token);
      return token.ok ? ok({ mode: CredentialMode.Token, token: token.value, acknowledgePolicy: gate.value }) : fail(token.failure);
    }
    case CredentialMode.Cloud: {
      if (typeof spec.selector !== "string") {
        return fail(credentialFailure(CredentialReason.MissingField, CredentialField.Selector));
      }
      if (!Object.hasOwn(ClaudeCloudEnv, spec.selector)) {
        return fail(credentialFailure(CredentialReason.UnknownSelector, CredentialField.Selector));
      }
      return ok({ mode: CredentialMode.Cloud, selector: spec.selector });
    }
    default:
      return fail(unsupportedFailure(spec.mode, CredentialUnsupportedReason.UnknownMode));
  }
}

export function credentialFromClaude(spec: unknown): Result<ClaudeCredential, RunFailure> {
  return credentialFromSpec<"claude">(CLAUDE_MODES, claudeCredentialOf, spec);
}

export { CLAUDE_CREDENTIAL_VARS };
