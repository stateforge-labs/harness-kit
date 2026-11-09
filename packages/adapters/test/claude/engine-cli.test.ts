import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCli } from "../../src/claude/engines/cli.ts";
import { claudeHeadlessArgs } from "../../src/claude/launch.ts";
import type { ClaudeCredential } from "../../src/core/credential.ts";
import { secret } from "../../src/core/secret.ts";
import { resolveTools, TOOLS_OFF } from "../../src/core/policy.ts";
import { ArgvCarry } from "../../src/core/engine-constants.ts";
import type { EngineInput, ResolvedOptions } from "../../src/driver/port.ts";
import { adaptersFixtures } from "../support/fixtures.ts";
import { type InterpretRaw, interpretRaw } from "../support/interpret.ts";

const headless = join(adaptersFixtures, "claude", "headless");
const stream = readFileSync(join(headless, "claude-stream-json-verbose.jsonl"), "utf8");
const apiKey: ClaudeCredential = { mode: "api-key", key: secret("sk-test") };
const base = {
  model: null,
  effort: null,
  persist: true,
  maxArgvBytes: null,
  cwd: "/work",
  tools: resolveTools(undefined, undefined),
} as unknown as ResolvedOptions;

function input(overrides: Partial<EngineInput<"claude">> = {}): EngineInput<"claude"> {
  return { options: base, credential: apiKey, instructions: "SYS", input: "hello", outFile: "/work/out.txt", runId: "run-1", ...overrides };
}

function withOptions(overrides: Partial<ResolvedOptions>): EngineInput<"claude"> {
  return input({ options: { ...base, ...overrides } });
}

function raw(stdout: string, code: number | null = 0): InterpretRaw {
  return { stdout, stderrTail: "", exit: { code, signal: null }, outFileText: null, requestedModel: "haiku" };
}

describe("claudeCli invocation", () => {
  test("default argv with instructions and no optional flags", () => {
    const result = claudeCli.invocation(input());
    expect(result.ok && result.value.args).toEqual(["-p", "--output-format", "stream-json", "--verbose", "--system-prompt", "SYS"]);
  });

  test("carries stdin, program and the instructions argv marker", () => {
    const result = claudeCli.invocation(input());
    if (!result.ok) {
      throw new Error("expected ok");
    }
    expect(result.value.stdin).toBe("hello");
    expect(result.value.outFile).toBeNull();
    expect(result.value.argvCarries).toEqual([ArgvCarry.Instructions]);
    expect(result.value.program).toBe("claude");
  });

  test("empty instructions omit the system prompt flag", () => {
    const result = claudeCli.invocation(input({ instructions: "" }));
    expect(result.ok && result.value.args).toEqual(["-p", "--output-format", "stream-json", "--verbose"]);
  });

  test("model, non-persistence and effort are added in order", () => {
    const result = claudeCli.invocation(withOptions({ model: "haiku", persist: false, effort: "low" }));
    expect(result.ok && result.value.args).toEqual([
      "-p",
      "--model",
      "haiku",
      "--no-session-persistence",
      "--output-format",
      "stream-json",
      "--verbose",
      "--system-prompt",
      "SYS",
      "--effort",
      "low",
    ]);
  });

  test("tools off disables tools, MCP and settings", () => {
    const result = claudeCli.invocation(withOptions({ tools: resolveTools(TOOLS_OFF, undefined) }));
    expect(result.ok && result.value.args).toEqual([
      "-p",
      "--tools",
      "",
      "--strict-mcp-config",
      "--setting-sources",
      "",
      "--output-format",
      "stream-json",
      "--verbose",
      "--system-prompt",
      "SYS",
    ]);
  });

  test("login-store keeps project and local settings by default", () => {
    const result = claudeCli.invocation(input({ credential: { mode: "login-store", acknowledgePolicy: true } }));
    expect(result.ok && result.value.args).toEqual(["-p", "--setting-sources", "project,local", "--output-format", "stream-json", "--verbose", "--system-prompt", "SYS"]);
  });

  test("token mode keeps project and local settings by default", () => {
    const result = claudeCli.invocation(input({ credential: { mode: "token", token: secret("tok"), acknowledgePolicy: true } }));
    expect(result.ok && result.value.args).toEqual(["-p", "--setting-sources", "project,local", "--output-format", "stream-json", "--verbose", "--system-prompt", "SYS"]);
  });

  test("cloud mode adds no settings-source flag", () => {
    const result = claudeCli.invocation(input({ credential: { mode: "cloud", selector: "bedrock" } }));
    expect(result.ok && result.value.args).toEqual(["-p", "--output-format", "stream-json", "--verbose", "--system-prompt", "SYS"]);
  });

  test("tools off carries the policy env into the invocation", () => {
    const result = claudeCli.invocation(withOptions({ tools: resolveTools(TOOLS_OFF, undefined) }));
    expect(result.ok && result.value.env).toEqual({});
  });

  test("the policy flags are the same set the 0.1.0 headless builder used", () => {
    const result = claudeCli.invocation(withOptions({ model: "haiku", persist: false, tools: resolveTools(TOOLS_OFF, undefined), effort: "low" }));
    const legacy = claudeHeadlessArgs({ model: "haiku", systemPrompt: "SYS", effort: "low" }).flatMap((arg) => (arg === "json" ? ["stream-json", "--verbose"] : [arg]));
    expect(result.ok && [...result.value.args].sort()).toEqual([...legacy].sort());
  });

  test("accepts a measured native effort", () => {
    const result = claudeCli.invocation(withOptions({ effort: { native: "xhigh" } }));
    expect(result.ok && result.value.args.slice(-2)).toEqual(["--effort", "xhigh"]);
  });

  test("rejects a native effort outside the measured list", () => {
    const result = claudeCli.invocation(withOptions({ effort: { native: "turbo" } }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.failure.kind).toBe("unsupported");
  });

  test("harness-default effort adds no flag", () => {
    const result = claudeCli.invocation(withOptions({ effort: "harness-default" }));
    expect(result.ok && result.value.args).not.toContain("--effort");
  });

  test("too-large when the argv exceeds maxArgvBytes", () => {
    const result = claudeCli.invocation(withOptions({ maxArgvBytes: 20 }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.failure.kind).toBe("too-large");
  });

  test("too-large when one argument exceeds the measured per-argument limit", () => {
    const result = claudeCli.invocation(input({ instructions: "x".repeat(200_000) }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.failure.kind).toBe("too-large");
  });
});

describe("claudeCli interpret", () => {
  test("a non-zero exit is an exit failure", async () => {
    const result = await interpretRaw(claudeCli, raw(stream, 2));
    expect(!result.ok && result.failure.kind).toBe("exit");
  });

  test("a result without a text field is unparsable", async () => {
    const result = await interpretRaw(claudeCli, raw('{"type":"result"}'));
    expect(!result.ok && result.failure.kind).toBe("unparsable");
  });

  test("never throws on hostile stdout", async () => {
    for (const stdout of ["", "{", "\u0000", "x".repeat(1_000_000)]) {
      const result = await interpretRaw(claudeCli, raw(stdout));
      expect(result.ok).toBe(false);
    }
  });

  test("has a line reader and no help probe", () => {
    expect(claudeCli.parseLine("")).toEqual([]);
    expect(claudeCli.helpArgs).toBeNull();
    expect(claudeCli.checkHelp("")).toEqual({ ok: true, value: null });
  });
});
