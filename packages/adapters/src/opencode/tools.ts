import { OpenCodeTool } from "@stateforge-labs/harness-hooks";
import { ToolClass, ToolField } from "../constants.ts";
import type { Row } from "../core/rows.ts";
import { firstText } from "../core/tools.ts";

export const OpenCodeLegacyTool = { Bash: "bash" } as const;

export const OpenCodeInferredTool = {
  ApplyPatch: "apply_patch",
  CodeSearch: "codesearch",
  Glob: "glob",
  Grep: "grep",
  List: "list",
} as const;

const KIND = new Map<string, ToolClass>([
  [OpenCodeTool.Shell, ToolClass.Shell],
  [OpenCodeLegacyTool.Bash, ToolClass.Shell],
  [OpenCodeTool.Read, ToolClass.Read],
  [OpenCodeInferredTool.Grep, ToolClass.Read],
  [OpenCodeInferredTool.Glob, ToolClass.Read],
  [OpenCodeInferredTool.List, ToolClass.Read],
  [OpenCodeTool.Edit, ToolClass.Edit],
  [OpenCodeTool.Write, ToolClass.Edit],
  [OpenCodeTool.Patch, ToolClass.Edit],
  [OpenCodeInferredTool.ApplyPatch, ToolClass.Edit],
  [OpenCodeTool.WebFetch, ToolClass.Web],
  [OpenCodeTool.WebSearch, ToolClass.Web],
  [OpenCodeInferredTool.CodeSearch, ToolClass.Web],
  [OpenCodeTool.Subagent, ToolClass.Agent],
]);

const TARGET_KEYS = [ToolField.FilePathCamel, ToolField.FilePath, ToolField.Path, ToolField.Pattern] as const;

export function opencodeToolClass(name: string): ToolClass {
  return KIND.get(name) ?? ToolClass.Other;
}

export function opencodeToolTarget(input: Row): string | null {
  return firstText(input, TARGET_KEYS);
}
