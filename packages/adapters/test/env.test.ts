import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { EnvVar, adapterEnv, processEnv } from "../src/env.ts";

describe("adapterEnv", () => {
  test("defaults derive from HOME", () => {
    expect(adapterEnv({ HOME: "/h/u" })).toEqual({
      home: "/h/u",
      xdgDataHome: join("/h/u", ".local", "share"),
      xdgCacheHome: join("/h/u", ".cache"),
      codexHome: join("/h/u", ".codex"),
    });
  });

  test("explicit variables win over the defaults", () => {
    expect(
      adapterEnv({ HOME: "/h/u", XDG_DATA_HOME: "/data", XDG_CACHE_HOME: "/cache", CODEX_HOME: "/codex" }),
    ).toEqual({ home: "/h/u", xdgDataHome: "/data", xdgCacheHome: "/cache", codexHome: "/codex" });
  });

  test("an empty variable counts as unset", () => {
    expect(adapterEnv({ HOME: "", XDG_DATA_HOME: "", XDG_CACHE_HOME: "", CODEX_HOME: "" })).toEqual({
      home: homedir(),
      xdgDataHome: join(homedir(), ".local", "share"),
      xdgCacheHome: join(homedir(), ".cache"),
      codexHome: join(homedir(), ".codex"),
    });
  });

  test("the variable names are the documented ones", () => {
    expect(EnvVar).toEqual({
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
    });
  });
});

describe("processEnv", () => {
  test("returns a copy, not process.env itself", () => {
    const env: Record<string, string | undefined> = processEnv();
    expect(env).not.toBe(process.env);
    expect(env["PATH"]).toBe(process.env["PATH"]);
    env["STATEFORGE_PROBE_COPY"] = "1";
    expect(process.env["STATEFORGE_PROBE_COPY"]).toBeUndefined();
  });
});
