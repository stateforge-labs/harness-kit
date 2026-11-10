import { homedir } from "node:os";
import { join } from "node:path";
import { Dir } from "./constants.ts";

export type EnvSource = Readonly<Record<string, string | undefined>>;

export const EnvVar = {
  Home: "HOME",
  Path: "PATH",
  Tmpdir: "TMPDIR",
  XdgDataHome: "XDG_DATA_HOME",
  XdgCacheHome: "XDG_CACHE_HOME",
  CodexHome: "CODEX_HOME",
  ClaudeCode: "CLAUDECODE",
  ClaudeCodeEntrypoint: "CLAUDE_CODE_ENTRYPOINT",
  ClaudeConfigDir: "CLAUDE_CONFIG_DIR",
  AnthropicApiKey: "ANTHROPIC_API_KEY",
  AnthropicAuthToken: "ANTHROPIC_AUTH_TOKEN",
  AnthropicBaseUrl: "ANTHROPIC_BASE_URL",
  ClaudeCodeOauthToken: "CLAUDE_CODE_OAUTH_TOKEN",
  ClaudeCodeOauthTokenFd: "CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR",
  ClaudeCodeUseBedrock: "CLAUDE_CODE_USE_BEDROCK",
  ClaudeCodeUseVertex: "CLAUDE_CODE_USE_VERTEX",
  ClaudeCodeUseFoundry: "CLAUDE_CODE_USE_FOUNDRY",
  OpenAiApiKey: "OPENAI_API_KEY",
  CodexApiKey: "CODEX_API_KEY",
  AzureOpenAiApiKey: "AZURE_OPENAI_API_KEY",
  OpenCodeApiKey: "OPENCODE_API_KEY",
  AwsBearerTokenBedrock: "AWS_BEARER_TOKEN_BEDROCK",
  OpenCodeConfigContent: "OPENCODE_CONFIG_CONTENT",
  MaxMcpOutputTokens: "MAX_MCP_OUTPUT_TOKENS",
} as const;

export interface AdapterEnv {
  readonly home: string;
  readonly xdgDataHome: string;
  readonly xdgCacheHome: string;
  readonly codexHome: string;
}

const nonEmpty = (value: string | undefined): string | undefined => (value === undefined || value === "" ? undefined : value);

export function adapterEnv(source: EnvSource = process.env): AdapterEnv {
  const home = nonEmpty(source[EnvVar.Home]) ?? homedir();
  return {
    home,
    xdgDataHome: nonEmpty(source[EnvVar.XdgDataHome]) ?? join(home, ...Dir.LocalShare),
    xdgCacheHome: nonEmpty(source[EnvVar.XdgCacheHome]) ?? join(home, Dir.Cache),
    codexHome: nonEmpty(source[EnvVar.CodexHome]) ?? join(home, Dir.Codex),
  };
}

export function processEnv(): EnvSource {
  return { ...process.env };
}
