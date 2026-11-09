import { CodexTool } from "@stateforge-labs/harness-hooks";
import { CodexUse, ToolClass, ToolField, type CodexUseKind } from "../constants.ts";
import { obj, str } from "../core/rows.ts";

export interface CodexToolUse {
  readonly tool: CodexUseKind;
  readonly command?: string;
  readonly files?: readonly string[];
  readonly query?: string;
}

const EXEC_CMD = /exec_command\(\{[^]{0,200}?\bcmd\s*:\s*("(?:[^"\\]|\\.)*")/g;
const PATCHED = /\*\*\* (?:Add|Update|Delete) File: ([^\n"\\]+)/g;
const WEB_RUN = /web__run\(/;
const WEB_QUERY = /(?:ref_id|q)\s*:\s*"([^"]+)"/;

export function codexToolClass(name: string): ToolClass {
  return name === CodexTool.ApplyPatch ? ToolClass.Edit : ToolClass.Other;
}

export function codexToolTarget(): null {
  return null;
}

function unquote(literal: string): string {
  try {
    const value: unknown = JSON.parse(literal);
    if (typeof value === "string") {
      return value;
    }
  } catch {
    return literal.slice(1, -1).replaceAll("\\'", "'").replaceAll("\\n", "\n").replaceAll('\\"', '"').replaceAll("\\\\", "\\");
  }
  return literal.slice(1, -1);
}

function patchedFiles(source: string): string[] {
  return Array.from(source.matchAll(PATCHED), (match) => (match[1] ?? "").trim());
}

function execUses(source: string): CodexToolUse[] {
  const uses: CodexToolUse[] = [];
  for (const match of source.matchAll(EXEC_CMD)) {
    const command = unquote(match[1] ?? '""');
    const files = patchedFiles(command);
    uses.push(files.length > 0 ? { tool: CodexUse.ApplyPatch, files } : { tool: CodexUse.Shell, command });
  }
  if (uses.length === 0) {
    const files = patchedFiles(source);
    if (files.length > 0) {
      uses.push({ tool: CodexUse.ApplyPatch, files });
    }
  }
  if (WEB_RUN.test(source)) {
    const query = WEB_QUERY.exec(source)?.[1];
    uses.push(query === undefined ? { tool: CodexUse.Web } : { tool: CodexUse.Web, query });
  }
  return uses.length > 0 ? uses : [{ tool: CodexUse.Other }];
}

function parseArgs(raw: unknown): unknown {
  if (typeof raw !== "string") {
    return raw;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export function parseCodexToolCall(name: string, rawArgs: unknown): readonly CodexToolUse[] {
  if (name === CodexTool.Exec && typeof rawArgs === "string") {
    return execUses(rawArgs);
  }
  const input = obj(parseArgs(rawArgs));
  if (name === CodexTool.ApplyPatch) {
    const source = typeof rawArgs === "string" ? rawArgs : (str(input[ToolField.Input]) ?? JSON.stringify(rawArgs) ?? "");
    return [{ tool: CodexUse.ApplyPatch, files: patchedFiles(source) }];
  }
  const argv = input[ToolField.Command];
  if (Array.isArray(argv)) {
    const last = argv.findLast((word): word is string => typeof word === "string");
    return [{ tool: CodexUse.Shell, command: last ?? "" }];
  }
  return [{ tool: CodexUse.Other }];
}
