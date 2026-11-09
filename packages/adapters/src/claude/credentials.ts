import type { CredentialSpec, PolicyNotice } from "../core/credential.ts";
import { CredentialField, CredentialMode, CredentialValue, finish, homeFailure, isPrivateHome, NO_INJECTION, policyFailure, credentialFailure, secretInjection, unsupportedFailure, type CredentialPlan, type CredentialPlanInput, type Injection } from "../core/credential-plan.ts";
import { CredentialReason, CredentialUnsupportedReason, type RunFailure } from "../core/failure.ts";
import { fail, ok, type Result } from "../core/result.ts";
import type { IsolationSpec } from "../core/run.ts";
import { EnvVar } from "../env.ts";
import { ClaudeCloudEnv } from "./constants.ts";
import { claudePolicyNotice } from "./policy-notice.ts";

export const CLAUDE_CREDENTIAL_VARS: readonly string[] = [
  EnvVar.AnthropicApiKey,
  EnvVar.AnthropicAuthToken,
  EnvVar.AnthropicBaseUrl,
  EnvVar.ClaudeCodeOauthToken,
  EnvVar.ClaudeCodeOauthTokenFd,
  EnvVar.ClaudeCodeUseBedrock,
  EnvVar.ClaudeCodeUseVertex,
  EnvVar.ClaudeCodeUseFoundry,
];

function isGated(mode: string): mode is PolicyNotice["mode"] {
  return mode === CredentialMode.LoginStore || mode === CredentialMode.Token;
}

function cloudInjection(selector: string | undefined): Result<Injection, RunFailure> {
  const name = selector !== undefined && Object.hasOwn(ClaudeCloudEnv, selector) ? ClaudeCloudEnv[selector] : undefined;
  if (name === undefined) {
    return fail(credentialFailure(CredentialReason.UnknownSelector, CredentialField.Selector));
  }
  return ok({ [name]: CredentialValue.Enabled });
}

function claudeInjection(spec: CredentialSpec, isolation: IsolationSpec): Result<Injection, RunFailure> {
  switch (spec.mode) {
    case CredentialMode.ApiKey:
      return secretInjection(spec.key, CredentialField.Key, EnvVar.AnthropicApiKey);
    case CredentialMode.Token:
      return secretInjection(spec.token, CredentialField.Token, EnvVar.ClaudeCodeOauthToken);
    case CredentialMode.LoginStore:
      return isPrivateHome(isolation) ? fail(unsupportedFailure(spec.mode, CredentialUnsupportedReason.PrivateHomeMovesLogin)) : ok(NO_INJECTION);
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
  const spec: CredentialSpec = input.credential;
  const mode = spec.mode;
  const notice = isGated(mode) ? claudePolicyNotice(mode) : null;
  if (notice !== null && spec.acknowledgePolicy !== true) {
    return fail(policyFailure(notice));
  }
  return finish(mode, CLAUDE_CREDENTIAL_VARS, claudeInjection(spec, input.isolation), notice);
}
