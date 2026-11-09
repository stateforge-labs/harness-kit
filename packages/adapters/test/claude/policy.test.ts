import { describe, expect, test } from "bun:test";
import { claudePolicy } from "../../src/claude/policy.ts";
import { ClaudeQuietEnv } from "../../src/claude/constants.ts";
import { LINUX_MAX_ARG_BYTES } from "../../src/core/limits.ts";
import { EnvKind, resolveTools, TOOLS_DEFAULT, TOOLS_OFF, type EnvPolicy, type McpEndpoint } from "../../src/core/policy.ts";
import { secret } from "../../src/core/secret.ts";
import type { PolicyInput } from "../../src/driver/port.ts";
import { fixture, mentions, routedRig, SENTINEL } from "../runtime/support.ts";

const API_KEY = { mode: "api-key", key: secret(SENTINEL) } as never;
const REQUEST = { instructions: "x", input: "y" };
const STREAM = fixture("claude", "claude-stream-json-verbose.jsonl");

function policyFor(tools: Parameters<typeof resolveTools>[0], credentialMode: string) {
  const input: PolicyInput = { tools: resolveTools(tools, undefined), credentialMode };
  const result = claudePolicy(input);
  if (!result.ok) {
    throw new Error("expected ok");
  }
  return result.value;
}

describe("claudePolicy", () => {
  test("TOOLS_OFF gives tools, strict mcp and setting sources in order and no env", () => {
    for (const mode of ["api-key", "login-store", "token", "cloud"]) {
      expect(policyFor(TOOLS_OFF, mode)).toEqual({ args: ["--tools", "", "--strict-mcp-config", "--setting-sources", ""], env: {} });
    }
  });

  test("TOOLS_DEFAULT with login-store or token gives only the user-excluded setting sources", () => {
    for (const mode of ["login-store", "token"]) {
      expect(policyFor(TOOLS_DEFAULT, mode)).toEqual({ args: ["--setting-sources", "project,local"], env: {} });
    }
  });

  test("TOOLS_DEFAULT with api-key or cloud gives no policy args", () => {
    for (const mode of ["api-key", "cloud"]) {
      expect(policyFor(TOOLS_DEFAULT, mode)).toEqual({ args: [], env: {} });
    }
  });

  test("settings none wins over the user-excluded sources", () => {
    expect(policyFor({ ...TOOLS_DEFAULT, settings: "none" }, "login-store").args).toEqual(["--setting-sources", ""]);
  });

  test("each axis applies on its own", () => {
    expect(policyFor({ ...TOOLS_DEFAULT, builtins: "off" }, "api-key").args).toEqual(["--tools", ""]);
    expect(policyFor({ ...TOOLS_DEFAULT, mcp: [] }, "api-key").args).toEqual(["--strict-mcp-config"]);
  });

  test("an mcp allowlist adds no argument", () => {
    const endpoint: McpEndpoint = { name: "docs", url: "https://example.test/mcp", bearer: null, allow: [] };
    expect(policyFor({ ...TOOLS_DEFAULT, mcp: [endpoint] }, "api-key").args).toEqual([]);
  });
});

describe("claude runs through the policy", () => {
  test("plan with TOOLS_OFF lists three supported cells", () => {
    const { runtime } = routedRig({ stdout: "" });
    const planned = runtime.headless("claude", { credential: API_KEY, tools: TOOLS_OFF } as never).plan(REQUEST);
    expect(planned.ok && planned.value.confinement.map((c) => [c.capability, c.support.state])).toEqual([
      ["builtin-tools-off", "supported"],
      ["mcp-none", "supported"],
      ["settings-sources", "supported"],
    ]);
    expect(planned.ok && planned.value.engine === "cli" && planned.value.args).toEqual(
      expect.arrayContaining(["--tools", "", "--strict-mcp-config", "--setting-sources", ""]),
    );
  });

  test("an api key with a base url injects the base url variable and never prints the key", async () => {
    const credential = { mode: "api-key", key: secret(SENTINEL), baseUrl: "https://gateway.test" } as never;
    const { runtime, specs } = routedRig({ stdout: STREAM });
    const handle = runtime.headless("claude", { credential } as never);
    const planned = handle.plan(REQUEST);
    expect(planned.ok && planned.value.env.inject).toEqual(["ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL"]);
    expect(mentions(planned, SENTINEL)).toBe(false);
    const result = await handle.run(REQUEST);
    expect(result.ok).toBe(true);
    const child = specs.find((spec) => spec.args.includes("-p"));
    expect(child?.env.ANTHROPIC_BASE_URL).toBe("https://gateway.test");
    expect(child?.env.ANTHROPIC_API_KEY).toBe(SENTINEL);
  });

  test("an ambient base url is stripped when the credential has none", async () => {
    const { runtime, specs } = routedRig({ stdout: STREAM }, { source: { PATH: "/bin", HOME: "/h/u", ANTHROPIC_BASE_URL: "https://ambient.test" } });
    await runtime.headless("claude", { credential: API_KEY } as never).run(REQUEST);
    expect(specs.find((spec) => spec.args.includes("-p"))?.env.ANTHROPIC_BASE_URL).toBeUndefined();
  });

  test("instructions one byte over the per-argument limit are too-large and nothing spawns", async () => {
    const { runtime, specs } = routedRig({ stdout: STREAM });
    const result = await runtime.headless("claude", { credential: API_KEY } as never).run({ instructions: "x".repeat(LINUX_MAX_ARG_BYTES + 1), input: "y" });
    expect(!result.ok && result.failure).toMatchObject({ kind: "too-large", field: "instructions" });
    expect(specs.filter((spec) => spec.args.includes("-p"))).toHaveLength(0);
  });

  test("a closed environment with quiet carries exactly the set, the quiet variables and the credential", async () => {
    const env: EnvPolicy = { kind: EnvKind.Closed, set: { PATH: "/bin", HOME: "/h/u" }, quiet: true };
    const { runtime, specs } = routedRig({ stdout: STREAM }, { source: { PATH: "/bin", HOME: "/h/u", AMBIENT: "ambient-value" } });
    const result = await runtime.headless("claude", { credential: API_KEY, env } as never).run(REQUEST);
    expect(result.ok).toBe(true);
    expect(specs.find((spec) => spec.args.includes("-p"))?.env).toEqual({ PATH: "/bin", HOME: "/h/u", ...ClaudeQuietEnv, ANTHROPIC_API_KEY: SENTINEL });
  });
});
