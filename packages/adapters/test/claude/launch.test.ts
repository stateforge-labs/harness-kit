import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CLAUDE_BINARY, CLAUDE_NESTED_ENV, claudeHeadlessArgs, parseClaudeResult } from "../../src/claude/launch.ts";
import { EnvVar } from "../../src/env.ts";
import { adaptersFixtures } from "../support/fixtures.ts";

const headless = join(adaptersFixtures, "claude", "headless");
const help = readFileSync(join(headless, "help.txt"), "utf8");
const read = (name: string): string => readFileSync(join(headless, name), "utf8");

describe("claudeHeadlessArgs", () => {
  test("builds the exact headless argv", () => {
    expect(claudeHeadlessArgs({ model: "haiku", systemPrompt: "SYS" })).toEqual([
      "-p",
      "--model",
      "haiku",
      "--no-session-persistence",
      "--tools",
      "",
      "--setting-sources",
      "",
      "--strict-mcp-config",
      "--output-format",
      "json",
      "--system-prompt",
      "SYS",
    ]);
  });

  test("appends effort only when given", () => {
    expect(claudeHeadlessArgs({ model: "haiku", systemPrompt: "SYS", effort: "low" }).slice(-2)).toEqual(["--effort", "low"]);
    expect(claudeHeadlessArgs({ model: "haiku", systemPrompt: "SYS", effort: null })).not.toContain("--effort");
  });

  test("every emitted flag appears in the captured claude help", () => {
    const flags = claudeHeadlessArgs({ model: "haiku", systemPrompt: "SYS", effort: "low" }).filter((token) => token.startsWith("-"));
    for (const flag of flags) {
      expect(help).toContain(flag);
    }
  });

  test("binary and nested-session variables", () => {
    expect(CLAUDE_BINARY).toBe("claude");
    expect(CLAUDE_NESTED_ENV).toEqual([EnvVar.ClaudeCode, EnvVar.ClaudeCodeEntrypoint]);
  });
});

describe("parseClaudeResult", () => {
  test("reads the captured headless result", () => {
    const parsed = parseClaudeResult(read("claude-result.json"));
    expect(parsed).not.toBeNull();
    expect(parsed?.text.length).toBeGreaterThan(0);
    expect(parsed?.costUsd).toBeGreaterThanOrEqual(0);
  });

  test("costUsd is 0 when total_cost_usd is absent", () => {
    expect(parseClaudeResult(JSON.stringify({ result: "hi" }))).toEqual({ text: "hi", costUsd: 0 });
  });

  test("null for non-JSON, non-object and missing result", () => {
    expect(parseClaudeResult("not json")).toBeNull();
    expect(parseClaudeResult("[1,2]")).toBeNull();
    expect(parseClaudeResult(JSON.stringify({ total_cost_usd: 1 }))).toBeNull();
    expect(parseClaudeResult(JSON.stringify({ result: 3 }))).toBeNull();
  });
});
