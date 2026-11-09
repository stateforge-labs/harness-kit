import { EnvVar } from "../env.ts";

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

export const CODEX_CREDENTIAL_VARS: readonly string[] = [EnvVar.OpenAiApiKey, EnvVar.CodexApiKey];

export const OPENCODE_CREDENTIAL_VARS: readonly string[] = [
  EnvVar.AnthropicApiKey,
  EnvVar.OpenAiApiKey,
  EnvVar.AzureOpenAiApiKey,
  EnvVar.OpenCodeApiKey,
  EnvVar.AwsBearerTokenBedrock,
  EnvVar.OpenCodeConfigContent,
];
