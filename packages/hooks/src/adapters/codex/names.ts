export const CodexHook = {
  Interrupt: "Interrupt",
  PermissionRequest: "PermissionRequest",
  PostCompact: "PostCompact",
  PostModelRequest: "PostModelRequest",
  PostToolUse: "PostToolUse",
  PreCompact: "PreCompact",
  PreModelRequest: "PreModelRequest",
  PreToolUse: "PreToolUse",
  SessionEnd: "SessionEnd",
  SessionStart: "SessionStart",
  Stop: "Stop",
  SubagentStart: "SubagentStart",
  SubagentStop: "SubagentStop",
  UserPromptSubmit: "UserPromptSubmit",
} as const;

export type CodexHookName = (typeof CodexHook)[keyof typeof CodexHook];

export const CodexTool = { SpawnAgent: "collaborationspawn_agent" } as const;
