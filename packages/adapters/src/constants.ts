export const Dir = {
  LocalShare: [".local", "share"],
  Cache: ".cache",
  Codex: ".codex",
  Claude: ".claude",
} as const;

export const Unknown = {
  NotJson: "(not-json)",
  Untyped: "(untyped)",
} as const;

export const ToolClass = {
  Shell: "shell",
  Read: "read",
  Edit: "edit",
  Web: "web",
  Agent: "agent",
  Other: "other",
} as const;

export type ToolClass = (typeof ToolClass)[keyof typeof ToolClass];

export const ToolField = {
  FilePath: "file_path",
  FilePathCamel: "filePath",
  NotebookPath: "notebook_path",
  Path: "path",
  Pattern: "pattern",
  Command: "command",
  Input: "input",
  RefId: "ref_id",
  Query: "q",
} as const;

export const CodexUse = {
  ApplyPatch: "apply_patch",
  Shell: "shell",
  Web: "web",
  Other: "other",
} as const;

export type CodexUseKind = (typeof CodexUse)[keyof typeof CodexUse];
