import { describe, expect, test } from "bun:test";
import { claudeSdkEngine } from "../../../src/claude/engines/sdk.ts";
import { bearerEnvName, buildQueryOptions } from "../../../src/claude/engines/sdk-options.ts";
import { TOOLS_OFF } from "../../../src/core/policy.ts";
import { BASE_URL, BEARER, DIRS, KEY, SESSION, collect, endpoint, fakeQuery, memoryStore, runInput } from "./support.ts";

const abortController = new AbortController();
const ctx = { abortController, hooks: null, store: null, spawn: null } as const;

function built(parts: Parameters<typeof runInput>[0] = {}) {
  const result = buildQueryOptions(runInput(parts), ctx);
  if (!result.ok) {
    throw new Error(result.failure.kind);
  }
  return result.value;
}

describe("sdk query options", () => {
  test("built-ins are off, settings are empty, the MCP config is strict and the runtime is explicit", () => {
    const options = built({ options: { binary: { path: "/opt/claude", runtime: "bun" } } });
    expect(options.tools).toEqual([]);
    expect(options.strictMcpConfig).toBe(true);
    expect(options.settingSources).toEqual([]);
    expect(options.executable).toBe("bun");
    expect(options.pathToClaudeCodeExecutable).toBe("/opt/claude");
    expect(options.includePartialMessages).toBe(false);
    expect(options.persistSession).toBe(false);
    expect(options.abortController).toBe(abortController);
    expect(options.cwd).toBe(DIRS.cwd);
    expect(options.systemPrompt).toBe("be brief");
    expect(options.maxTurns).toBe(3);
  });

  test("an unset runtime is detected and always passed", () => {
    expect(["node", "bun"]).toContain(built().executable);
    expect(built().pathToClaudeCodeExecutable).toBeUndefined();
  });

  test("the child env is the injected env plus the directories and the base url", () => {
    const options = built({ env: { ANTHROPIC_API_KEY: KEY, EXTRA: "1" } });
    expect(options.env).toEqual({
      ANTHROPIC_API_KEY: KEY,
      EXTRA: "1",
      HOME: DIRS.home,
      CLAUDE_CONFIG_DIR: DIRS.configDir,
      TMPDIR: DIRS.tmpDir,
      ANTHROPIC_BASE_URL: BASE_URL,
    });
  });

  test("the quiet env is added when the closed policy asks for it and the consumer wins", () => {
    const options = built({ options: { env: { kind: "closed", set: {}, quiet: true } }, env: { ANTHROPIC_API_KEY: KEY, DISABLE_TELEMETRY: "0" } });
    expect(options.env["CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC"]).toBe("1");
    expect(options.env["DISABLE_TELEMETRY"]).toBe("0");
    expect(built().env["CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC"]).toBeUndefined();
  });

  test("nothing is read from the ambient environment", () => {
    process.env["AMBIENT_SENTINEL_VAR"] = "leak";
    try {
      expect(Object.keys(built().env)).not.toContain("AMBIENT_SENTINEL_VAR");
    } finally {
      delete process.env["AMBIENT_SENTINEL_VAR"];
    }
  });

  test("an mcp setting that is not a list is invalid config", () => {
    const result = buildQueryOptions(runInput({ options: { tools: { ...TOOLS_OFF, mcp: "harness-default" } } }), ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure).toMatchObject({ kind: "invalid-config", field: "tools.mcp" });
    }
  });

  test("effort, model, schema and resume are mapped", () => {
    const options = built({
      start: { effort: "low", model: "haiku", outputSchema: { type: "object" }, resume: { sessionId: SESSION, checkpoint: "uuid-9" } },
    });
    expect(options.effort).toBe("low");
    expect(options.model).toBe("haiku");
    expect(options.outputFormat).toEqual({ type: "json_schema", schema: { type: "object" } });
    expect(options.resume).toBe(SESSION);
    expect(options.resumeSessionAt).toBe("uuid-9");
  });

  test("harness-default effort sets nothing and a native effort outside the measured list is refused", () => {
    expect(built({ start: { effort: "harness-default" } }).effort).toBeUndefined();
    const refused = buildQueryOptions(runInput({ start: { effort: { native: "bogus" } } }), ctx);
    expect(refused.ok).toBe(false);
  });
});

describe("sdk mcp endpoints", () => {
  const tools = { ...TOOLS_OFF, mcp: [endpoint("alpha"), endpoint("beta", null, ["lookup", "save"])] };
  const env = { ANTHROPIC_API_KEY: KEY, [bearerEnvName(0)]: BEARER };

  test("the header names the env variable and never holds the token", () => {
    const options = built({ options: { tools }, env });
    expect(options.mcpServers["alpha"]).toEqual({ type: "http", url: "http://127.0.0.1:1/alpha", headers: { authorization: "Bearer ${AGENT_MCP_BEARER_0}" } });
    expect(options.mcpServers["beta"]?.headers).toEqual({});
    expect(options.env[bearerEnvName(0)]).toBe(BEARER);
  });

  test("the options hold no token or key outside env", () => {
    const options = built({ options: { tools }, env });
    const { env: _env, abortController: _abort, ...rest } = options;
    const text = JSON.stringify(rest);
    expect(text).not.toContain(BEARER);
    expect(text).not.toContain(KEY);
  });

  test("an endpoint bearer without a value in the env fails closed", () => {
    const result = buildQueryOptions(runInput({ options: { tools } }), ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure).toMatchObject({ kind: "invalid-config", field: "tools.mcp" });
    }
  });

  test("allowed tools follow the endpoint allow lists and everything else is denied", () => {
    const options = built({ options: { tools }, env });
    expect(options.allowedTools).toEqual(["mcp__alpha", "mcp__beta__lookup", "mcp__beta__save"]);
    expect(options.permissionMode).toBe("dontAsk");
  });

  test("no endpoints means no permission override", () => {
    const options = built();
    expect(options.allowedTools).toBeUndefined();
    expect(options.permissionMode).toBeUndefined();
    expect(options.mcpServers).toEqual({});
  });
});

describe("sdk describe", () => {
  test("the plan names options and env variables and carries no value", () => {
    const tools = { ...TOOLS_OFF, mcp: [endpoint("alpha")] };
    const plan = claudeSdkEngine({ query: fakeQuery().query }).describe(runInput({ options: { tools }, env: { ANTHROPIC_API_KEY: KEY, [bearerEnvName(0)]: BEARER } }));
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.value.engine).toBe("sdk");
      expect(plan.value.entry).toBe("query");
      expect(plan.value.env.kind).toBe("closed");
      expect(plan.value.env.inject).toEqual(["ANTHROPIC_API_KEY", "AGENT_MCP_BEARER_0", "ANTHROPIC_BASE_URL"]);
      expect(Object.keys(plan.value.options)).toContain("strictMcpConfig");
      const text = JSON.stringify(plan.value);
      for (const value of [KEY, BEARER, BASE_URL]) {
        expect(text).not.toContain(value);
      }
    }
  });

  test("a config failure is a value", () => {
    const tools = { ...TOOLS_OFF, mcp: [endpoint("alpha")] };
    const plan = claudeSdkEngine({ query: fakeQuery().query }).describe(runInput({ options: { tools } }));
    expect(plan.ok).toBe(false);
  });
});

describe("sdk persistence", () => {
  test("a transcript store turns persistence on and the options carry an adapter", async () => {
    const fake = fakeQuery([]);
    const run = claudeSdkEngine({ query: fake.query }).start(runInput({ start: { store: memoryStore() } }));
    await collect(run);
    expect(fake.calls[0]?.options.persistSession).toBe(true);
    expect(fake.calls[0]?.options.sessionStore).toBeDefined();
  });
});
