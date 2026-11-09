export const OpenCodeHook = {
  PermissionEvaluate: "permission.evaluate",
  SessionCompaction: "session.compaction",
  SessionCompactionEnded: "session.compaction.ended",
  SessionCompactionFailed: "session.compaction.failed",
  SessionCompactionStarted: "session.compaction.started",
  SessionContext: "session.context",
  SessionCreated: "session.created",
  SessionExecutionFailed: "session.execution.failed",
  SessionExecutionInterrupted: "session.execution.interrupted",
  SessionExecutionStarted: "session.execution.started",
  SessionExecutionSucceeded: "session.execution.succeeded",
  SessionExperimentalIdle: "session.experimental.idle",
  SessionPrompt: "session.prompt",
  ToolExecuteAfter: "tool.execute.after",
  ToolExecuteBefore: "tool.execute.before",
} as const;

export type OpenCodeHookName = (typeof OpenCodeHook)[keyof typeof OpenCodeHook];

export const OpenCodeTool = {
  Edit: "edit",
  Execute: "execute",
  Patch: "patch",
  Read: "read",
  Shell: "shell",
  Skill: "skill",
  Subagent: "subagent",
  WebFetch: "webfetch",
  WebSearch: "websearch",
  Write: "write",
} as const;

export type OpenCodeToolName = (typeof OpenCodeTool)[keyof typeof OpenCodeTool];
