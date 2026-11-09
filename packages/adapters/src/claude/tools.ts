import { ClaudeTool } from "@stateforge-labs/harness-hooks";
import { ToolClass, ToolField } from "../constants.ts";
import type { Row } from "../core/rows.ts";
import { firstText } from "../core/tools.ts";

const LEGACY_BASH = "bash";

const KIND = new Map<string, ToolClass>([
  [ClaudeTool.Bash, ToolClass.Shell],
  [LEGACY_BASH, ToolClass.Shell],
  [ClaudeTool.Read, ToolClass.Read],
  [ClaudeTool.Grep, ToolClass.Read],
  [ClaudeTool.Glob, ToolClass.Read],
  [ClaudeTool.LS, ToolClass.Read],
  [ClaudeTool.Edit, ToolClass.Edit],
  [ClaudeTool.Write, ToolClass.Edit],
  [ClaudeTool.MultiEdit, ToolClass.Edit],
  [ClaudeTool.NotebookEdit, ToolClass.Edit],
  [ClaudeTool.WebFetch, ToolClass.Web],
  [ClaudeTool.WebSearch, ToolClass.Web],
  [ClaudeTool.Agent, ToolClass.Agent],
  [ClaudeTool.Task, ToolClass.Agent],
]);

const TARGET_KEYS = [ToolField.FilePath, ToolField.NotebookPath, ToolField.Path, ToolField.Pattern] as const;

export function claudeToolClass(name: string): ToolClass {
  return KIND.get(name) ?? ToolClass.Other;
}

export function claudeToolTarget(input: Row): string | null {
  return firstText(input, TARGET_KEYS);
}
