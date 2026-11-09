import { describe, expect, test } from "bun:test";
import { Harness } from "@stateforge-labs/harness-hooks";
import { ToolClass } from "../src/constants.ts";
import { toolClass, toolTarget } from "../src/tools.ts";

describe("toolClass dispatcher", () => {
  test("routes each harness to its classifier", () => {
    expect(toolClass(Harness.Claude, "Bash")).toBe(ToolClass.Shell);
    expect(toolClass(Harness.Claude, "Read")).toBe(ToolClass.Read);
    expect(toolClass(Harness.OpenCode, "shell")).toBe(ToolClass.Shell);
    expect(toolClass(Harness.OpenCode, "write")).toBe(ToolClass.Edit);
    expect(toolClass(Harness.Codex, "apply_patch")).toBe(ToolClass.Edit);
    expect(toolClass(Harness.Codex, "exec")).toBe(ToolClass.Other);
  });
});

describe("toolTarget dispatcher", () => {
  test("routes each harness to its target reader", () => {
    expect(toolTarget(Harness.Claude, "Read", { file_path: "a.md" })).toBe("a.md");
    expect(toolTarget(Harness.OpenCode, "read", { filePath: "b.md" })).toBe("b.md");
    expect(toolTarget(Harness.Codex, "exec", { cmd: "ls" })).toBeNull();
  });
});
