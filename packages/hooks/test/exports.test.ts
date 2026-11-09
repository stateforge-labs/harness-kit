import { describe, expect, test } from "bun:test";
import * as hooks from "../src/index.ts";
import { ClaudeHook, CodexHook, OpenCodeHook } from "../src/index.ts";

describe("the index exports the knowledge other packages build on", () => {
  test("every harness schema map is keyed by the hook names of its harness", () => {
    expect(hooks.claudeSchemas.size).toBe(Object.values(ClaudeHook).length);
    expect(hooks.codexSchemas.size).toBe(Object.values(CodexHook).length);
    expect(hooks.opencodeSchemas.size).toBe(Object.values(OpenCodeHook).length);
    const claudeNames: readonly string[] = Object.values(ClaudeHook);
    const codexNames: readonly string[] = Object.values(CodexHook);
    const opencodeNames: readonly string[] = Object.values(OpenCodeHook);
    for (const name of hooks.claudeSchemas.keys()) expect(claudeNames).toContain(name);
    for (const name of hooks.codexSchemas.keys()) expect(codexNames).toContain(name);
    for (const name of hooks.opencodeSchemas.keys()) expect(opencodeNames).toContain(name);
  });

  test("the closed value sets are exported per harness as zod enums", () => {
    expect(hooks.claudeEnums.PermissionMode.options).toContain("default");
    expect(hooks.codexEnums.PermissionMode.options).toContain("default");
    expect(hooks.opencodeEnums.ToolStatus.options).toContain("completed");
    expect(hooks.claudeEnums.CompactTrigger.options).toEqual(hooks.codexEnums.CompactTrigger.options);
  });

  test("the Claude tool input schemas are exported with their helpers", () => {
    expect(Object.keys(hooks.claudeToolInputs)).toContain("Bash");
    expect(hooks.claudeToolInputs.Bash!.safeParse({ command: "ls" }).success).toBe(true);
    expect(hooks.anyToolInput.safeParse({ a: 1 }).success).toBe(true);
    expect(typeof hooks.checkToolInput).toBe("function");
  });
});
