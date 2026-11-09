import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { ClaudeTool, CodexTool, OpenCodeTool } from "../src/index.ts";
import { fixturesDir } from "./fixtures-dir.ts";

function hookFixtures(harness: string): Record<string, unknown>[] {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        return walk(path);
      }
      return name.endsWith(".json") && !name.endsWith(".expected.json") && !name.endsWith(".log.json") ? [path] : [];
    });
  return walk(join(fixturesDir, harness)).map((path) => JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>);
}

function namesIn(rows: Record<string, unknown>[], key: string): string[] {
  return [...new Set(rows.flatMap((row) => (typeof row[key] === "string" ? [row[key]] : [])))].sort();
}

const values = (table: Record<string, string>): string[] => Object.values(table);

describe("tool name constants", () => {
  test("every Claude tool name in the hook fixtures is a constant", () => {
    const known = new Set(values(ClaudeTool));
    const names = namesIn(hookFixtures("claude"), "tool_name");
    expect(names).toContain(ClaudeTool.Bash);
    const unknown = names.filter((name) => !known.has(name) && !name.startsWith("mcp__") && name !== "SubagentHandback");
    expect(unknown).toEqual([]);
  });

  test("every Codex tool name in the hook fixtures is a constant", () => {
    const known = new Set(values(CodexTool));
    const names = namesIn(hookFixtures("codex"), "tool_name");
    expect(names).toContain(CodexTool.SpawnAgent);
    expect(names.filter((name) => !known.has(name))).toEqual([]);
  });

  test("every OpenCode tool name in the hook fixtures is a constant", () => {
    const known = new Set(values(OpenCodeTool));
    const names = namesIn(hookFixtures("opencode"), "tool");
    expect(names).toEqual([OpenCodeTool.Read, OpenCodeTool.Shell, OpenCodeTool.Subagent, OpenCodeTool.Write].sort());
    expect(names.filter((name) => !known.has(name))).toEqual([]);
  });
});
