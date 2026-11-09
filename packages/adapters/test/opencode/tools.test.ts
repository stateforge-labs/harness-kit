import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { OpenCodeTool } from "@stateforge-labs/harness-hooks";
import { OpenCodeLegacyTool, opencodeToolClass, opencodeToolTarget } from "../../src/opencode/tools.ts";
import { ToolClass } from "../../src/constants.ts";
import { arr, obj, str, type Row } from "../../src/core/rows.ts";
import { adaptersFixtures, hookRows } from "../support/fixtures.ts";
import { parseRow } from "../../src/core/rows.ts";

const store = join(adaptersFixtures, "opencode");

const storeJson = (file: string): Row => obj(JSON.parse(readFileSync(join(store, file), "utf8")));

const partUses = (): { name: string; input: Row }[] =>
  arr(storeJson("rows-v1.json")["part"]).flatMap((row) => {
    const data = parseRow(String(row["data"]));
    const name = str(data?.["tool"]);
    return data?.["type"] === "tool" && name !== null ? [{ name, input: obj(obj(data["state"])["input"]) }] : [];
  });

const messageUses = (): { name: string; input: Row }[] =>
  arr(storeJson("rows-v2.json")["session_message"]).flatMap((row) => {
    const data = parseRow(String(row["data"]));
    return arr(data?.["content"]).flatMap((block) => {
      const name = str(block["name"]);
      return block["type"] === "tool" && name !== null ? [{ name, input: obj(obj(block["state"])["input"]) }] : [];
    });
  });

const versionNames = (): string[] =>
  Object.values(storeJson("versions.json")).flatMap((version) => arr([obj(version)]).flatMap((v) => (Array.isArray(v["tools"]) ? (v["tools"] as string[]) : [])));

const OTHER = new Set<string>([OpenCodeTool.Execute, OpenCodeTool.Skill, "report"]);

describe("opencodeToolClass", () => {
  test("classifies every tool name in the store capture and hook fixtures", () => {
    const names = [...new Set([...partUses(), ...messageUses()].map((use) => use.name).concat(versionNames(), hookRows("opencode").map((row) => str(row["tool"]) ?? "")))].filter(
      (name) => name !== "",
    );
    const wrong = names.filter((name) => (OTHER.has(name) || name.startsWith("proj_") ? opencodeToolClass(name) !== ToolClass.Other : opencodeToolClass(name) === ToolClass.Other));
    expect(wrong).toEqual([]);
  });

  test("shell is the 2.2.6 name and bash the 1.19.3 name", () => {
    expect(opencodeToolClass(OpenCodeTool.Shell)).toBe(ToolClass.Shell);
    expect(opencodeToolClass(OpenCodeLegacyTool.Bash)).toBe(ToolClass.Shell);
  });

  test("maps the subagent, read, write and web names", () => {
    expect(opencodeToolClass(OpenCodeTool.Subagent)).toBe(ToolClass.Agent);
    expect(opencodeToolClass(OpenCodeTool.Read)).toBe(ToolClass.Read);
    expect(opencodeToolClass("grep")).toBe(ToolClass.Read);
    expect(opencodeToolClass(OpenCodeTool.Write)).toBe(ToolClass.Edit);
    expect(opencodeToolClass(OpenCodeTool.Patch)).toBe(ToolClass.Edit);
    expect(opencodeToolClass(OpenCodeTool.WebFetch)).toBe(ToolClass.Web);
    expect(opencodeToolClass("websearch")).toBe(ToolClass.Web);
  });

  test("unknown and prototype names are other", () => {
    expect(opencodeToolClass("NoSuchTool")).toBe(ToolClass.Other);
    expect(opencodeToolClass("toString")).toBe(ToolClass.Other);
  });
});

describe("opencodeToolTarget", () => {
  test("reads filePath from the 2.2.6 messages and file_path from the 1.19.3 parts", () => {
    const read = (uses: { name: string; input: Row }[]) => uses.filter((use) => use.name === OpenCodeTool.Read);
    const camel = read(messageUses()).filter((use) => use.input["filePath"] !== undefined);
    const snake = read(partUses()).filter((use) => use.input["file_path"] !== undefined);
    expect(camel.length).toBeGreaterThan(0);
    expect(snake.length).toBeGreaterThan(0);
    expect(camel.filter((use) => opencodeToolTarget(use.input) !== str(use.input["filePath"]))).toEqual([]);
    expect(snake.filter((use) => opencodeToolTarget(use.input) !== str(use.input["file_path"]))).toEqual([]);
  });

  test("order is filePath, file_path, path, pattern", () => {
    expect(opencodeToolTarget({ filePath: "a", file_path: "b", path: "c" })).toBe("a");
    expect(opencodeToolTarget({ file_path: "b", path: "c" })).toBe("b");
    expect(opencodeToolTarget({ pattern: "*.md" })).toBe("*.md");
  });

  test("shell inputs and empty values give null", () => {
    expect(opencodeToolTarget({ command: "echo hi" })).toBeNull();
    expect(opencodeToolTarget({ filePath: "" })).toBeNull();
  });
});
