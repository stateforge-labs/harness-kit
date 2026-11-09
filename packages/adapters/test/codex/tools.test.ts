import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { CodexTool } from "@stateforge-labs/harness-hooks";
import { codexToolClass, codexToolTarget, parseCodexToolCall } from "../../src/codex/tools.ts";
import { CodexUse, ToolClass } from "../../src/constants.ts";
import { obj, str, type Row } from "../../src/core/rows.ts";
import { adaptersFixtures, filesUnder, rowsOf } from "../support/fixtures.ts";

const calls = (): { name: string; payload: Row }[] =>
  filesUnder(join(adaptersFixtures, "codex", "sessions"), (name) => name.endsWith(".jsonl")).flatMap((file) =>
    rowsOf(file).flatMap((row) => {
      const payload = obj(row["payload"]);
      const name = str(payload["name"]);
      return (payload["type"] === "function_call" || payload["type"] === "custom_tool_call") && name !== null ? [{ name, payload }] : [];
    }),
  );

describe("codexToolClass", () => {
  test("apply_patch is an edit and every other name is other", () => {
    expect(codexToolClass(CodexTool.ApplyPatch)).toBe(ToolClass.Edit);
    for (const name of [CodexTool.Exec, CodexTool.Wait, CodexTool.SpawnAgent, CodexTool.WaitAgent, CodexTool.Bash]) {
      expect(codexToolClass(name)).toBe(ToolClass.Other);
    }
  });

  test("the captured rollout names are the constants", () => {
    const names = [...new Set(calls().map((call) => call.name))].sort();
    expect(names).toEqual([CodexTool.Exec, CodexTool.Wait]);
  });
});

describe("codexToolTarget", () => {
  test("Codex has no target", () => {
    expect(codexToolTarget()).toBeNull();
  });
});

describe("parseCodexToolCall on the captured rollouts", () => {
  test("every captured exec source is other, since masking removed its call markers", () => {
    const execs = calls().filter((call) => call.name === CodexTool.Exec);
    expect(execs.length).toBeGreaterThan(0);
    expect(execs.filter((call) => JSON.stringify(parseCodexToolCall(call.name, call.payload["input"])) !== JSON.stringify([{ tool: CodexUse.Other }]))).toEqual([]);
  });

  test("captured wait calls carry no command", () => {
    const waits = calls().filter((call) => call.name === CodexTool.Wait);
    expect(waits.length).toBeGreaterThan(0);
    for (const call of waits) {
      expect(parseCodexToolCall(call.name, call.payload["arguments"])).toEqual([{ tool: CodexUse.Other }]);
    }
  });
});

describe("parseCodexToolCall on exec sources", () => {
  test("exec_command with a cmd is a shell use", () => {
    const source = 'const r = await tools.exec_command({cmd: "git status --short", yield_time_ms: 1000});';
    expect(parseCodexToolCall(CodexTool.Exec, source)).toEqual([{ tool: CodexUse.Shell, command: "git status --short" }]);
  });

  test("patch markers inside a command are one apply_patch use with its files", () => {
    const source = 'await tools.exec_command({cmd: "*** Update File: src/a.ts"});';
    expect(parseCodexToolCall(CodexTool.Exec, source)).toEqual([{ tool: CodexUse.ApplyPatch, files: ["src/a.ts"] }]);
  });

  test("bare patch markers without an exec command are an apply_patch use", () => {
    const source = "*** Add File: docs/new.md\n*** Delete File: old.txt";
    expect(parseCodexToolCall(CodexTool.Exec, source)).toEqual([{ tool: CodexUse.ApplyPatch, files: ["docs/new.md", "old.txt"] }]);
  });

  test("web__run adds a web use with its query", () => {
    const source = 'await tools.web__run({ref_id: "doc-42"});';
    expect(parseCodexToolCall(CodexTool.Exec, source)).toEqual([{ tool: CodexUse.Web, query: "doc-42" }]);
  });

  test("an exec source with none of those is other", () => {
    expect(parseCodexToolCall(CodexTool.Exec, "return 1;")).toEqual([{ tool: CodexUse.Other }]);
  });
});

describe("parseCodexToolCall on other calls", () => {
  test("an argv array gives a shell use with the last word", () => {
    expect(parseCodexToolCall(CodexTool.Wait, { command: ["bash", "-lc", "ls -la"] })).toEqual([{ tool: CodexUse.Shell, command: "ls -la" }]);
    expect(parseCodexToolCall(CodexTool.Wait, JSON.stringify({ command: ["bash", "-lc", "pwd"] }))).toEqual([{ tool: CodexUse.Shell, command: "pwd" }]);
  });

  test("apply_patch reads its files from the raw patch text", () => {
    expect(parseCodexToolCall(CodexTool.ApplyPatch, "*** Update File: src/b.ts")).toEqual([{ tool: CodexUse.ApplyPatch, files: ["src/b.ts"] }]);
    expect(parseCodexToolCall(CodexTool.ApplyPatch, { input: "*** Add File: c.md" })).toEqual([{ tool: CodexUse.ApplyPatch, files: ["c.md"] }]);
  });

  test("arguments that are not JSON give other", () => {
    expect(parseCodexToolCall(CodexTool.Wait, "{not json")).toEqual([{ tool: CodexUse.Other }]);
  });
});
