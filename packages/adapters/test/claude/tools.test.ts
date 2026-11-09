import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { ClaudeTool } from "@stateforge-labs/harness-hooks";
import { claudeToolClass, claudeToolTarget } from "../../src/claude/tools.ts";
import { ToolClass } from "../../src/constants.ts";
import { arr, obj, str, type Row } from "../../src/core/rows.ts";
import { adaptersFixtures, filesUnder, hookRows, rowsOf } from "../support/fixtures.ts";

interface Use {
  readonly name: string;
  readonly input: Row;
}

const transcriptUses = (): Use[] =>
  filesUnder(join(adaptersFixtures, "claude", "projects"), (name) => name.endsWith(".jsonl")).flatMap((file) =>
    rowsOf(file).flatMap((row) =>
      arr(obj(row["message"])["content"]).flatMap((block) => {
        const name = str(block["name"]);
        return block["type"] === "tool_use" && name !== null ? [{ name, input: obj(block["input"]) }] : [];
      }),
    ),
  );

const hookUses = (): Use[] =>
  hookRows("claude").flatMap((row) => {
    const name = str(row["tool_name"]);
    return name === null ? [] : [{ name, input: obj(row["tool_input"]) }];
  });

const OTHER = new Set<string>([ClaudeTool.AskUserQuestion, ClaudeTool.ToolSearch, ClaudeTool.SendMessage, "SubagentHandback"]);

describe("claudeToolClass", () => {
  test("classifies the tool names seen in the captured transcripts and hook fixtures", () => {
    const names = [...new Set([...transcriptUses(), ...hookUses()].map((use) => use.name))];
    expect(names).toContain(ClaudeTool.Bash);
    expect(names).toContain(ClaudeTool.Agent);
    const wrong = names.filter((name) => (OTHER.has(name) || name.startsWith("mcp__") ? claudeToolClass(name) !== ToolClass.Other : claudeToolClass(name) === ToolClass.Other));
    expect(wrong).toEqual([]);
  });

  test("maps each family of names to its class", () => {
    expect(claudeToolClass(ClaudeTool.Bash)).toBe(ToolClass.Shell);
    expect(claudeToolClass("bash")).toBe(ToolClass.Shell);
    expect(claudeToolClass(ClaudeTool.Read)).toBe(ToolClass.Read);
    expect(claudeToolClass(ClaudeTool.Grep)).toBe(ToolClass.Read);
    expect(claudeToolClass(ClaudeTool.Glob)).toBe(ToolClass.Read);
    expect(claudeToolClass(ClaudeTool.Edit)).toBe(ToolClass.Edit);
    expect(claudeToolClass(ClaudeTool.Write)).toBe(ToolClass.Edit);
    expect(claudeToolClass(ClaudeTool.WebFetch)).toBe(ToolClass.Web);
    expect(claudeToolClass(ClaudeTool.WebSearch)).toBe(ToolClass.Web);
    expect(claudeToolClass(ClaudeTool.Agent)).toBe(ToolClass.Agent);
    expect(claudeToolClass(ClaudeTool.Task)).toBe(ToolClass.Agent);
  });

  test("names it does not know, and prototype keys, are other", () => {
    expect(claudeToolClass("NoSuchTool")).toBe(ToolClass.Other);
    expect(claudeToolClass("constructor")).toBe(ToolClass.Other);
    expect(claudeToolClass("mcp__some_server__fetch")).toBe(ToolClass.Other);
  });
});

describe("claudeToolTarget", () => {
  test("reads the target from the captured inputs", () => {
    const uses = transcriptUses().filter((use) => [ClaudeTool.Read, ClaudeTool.Edit, ClaudeTool.Write].some((name) => name === use.name));
    expect(uses.length).toBeGreaterThan(0);
    const wrong = uses.filter((use) => claudeToolTarget(use.input) !== str(use.input["file_path"]));
    expect(wrong).toEqual([]);
  });

  test("prefers file_path, then notebook_path, then path, then pattern", () => {
    expect(claudeToolTarget({ notebook_path: "n.ipynb", path: "p", pattern: "*" })).toBe("n.ipynb");
    expect(claudeToolTarget({ path: "dir", pattern: "*.ts" })).toBe("dir");
    expect(claudeToolTarget({ pattern: "*.ts" })).toBe("*.ts");
  });

  test("Bash and an empty target give null", () => {
    expect(claudeToolTarget({ command: "ls" })).toBeNull();
    expect(claudeToolTarget({ file_path: "", pattern: "" })).toBeNull();
    for (const use of hookUses().filter((use) => use.name === ClaudeTool.Bash)) {
      expect(claudeToolTarget(use.input)).toBeNull();
    }
  });
});
