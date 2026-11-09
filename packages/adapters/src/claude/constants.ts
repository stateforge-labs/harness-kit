export const ClaudeDir = {
  Projects: "projects",
  Sessions: "sessions",
  Subagents: "subagents",
} as const;

export const ClaudeFile = {
  Transcript: ".jsonl",
  Session: ".json",
} as const;

export const ClaudeType = {
  User: "user",
  Assistant: "assistant",
  System: "system",
  AiTitle: "ai-title",
  LastPrompt: "last-prompt",
  QueueOperation: "queue-operation",
  Attachment: "attachment",
  Mode: "mode",
  PermissionMode: "permission-mode",
  AtisLatch: "atis-latch",
  FileHistorySnapshot: "file-history-snapshot",
  ApiRequestBlob: "api-request-blob",
  ApiRequest: "api-request",
  ApiRequestShape: "api-request-shape",
  SessionOwner: "session-owner",
  ToolsUsed: "tools-used",
  AgentName: "agent-name",
} as const;

export const ClaudeSubtype = {
  CompactBoundary: "compact_boundary",
  AwaySummary: "away_summary",
  LocalCommand: "local_command",
  TurnDuration: "turn_duration",
} as const;

export const ClaudeBlockType = {
  Text: "text",
  ToolUse: "tool_use",
  ToolResult: "tool_result",
  Thinking: "thinking",
} as const;

export const ClaudeTrigger = {
  Auto: "auto",
  Manual: "manual",
} as const;

export const ClaudeQueueOperation = {
  Enqueue: "enqueue",
  Remove: "remove",
  Dequeue: "dequeue",
} as const;

export const ClaudeAttachmentType = {
  QueuedCommand: "queued_command",
  Environment: "environment",
  Model: "model",
  OutputStyleInstructions: "output_style_instructions",
  DeferredToolsDelta: "deferred_tools_delta",
  AgentListingDelta: "agent_listing_delta",
  McpInstructionsDelta: "mcp_instructions_delta",
  TotalTokensReminder: "total_tokens_reminder",
  OutputStyle: "output_style",
  SessionContext: "session_context",
  Date: "date",
  CredentialOrg: "credential_org",
  PromptSnapshot: "prompt_snapshot",
  DeferredToolsRecord: "deferred_tools_record",
  File: "file",
  AutoMode: "auto_mode",
  Instructions: "instructions",
  RemoteSessionChange: "remote_session_change",
  AdvisorTool: "advisor_tool",
  ThinkingDrop: "thinking_drop",
  SilentTurnReminder: "silent_turn_reminder",
  SkillListing: "skill_listing",
} as const;

export const ClaudeOrigin = {
  Human: "human",
  TaskNotification: "task-notification",
} as const;

export const ClaudeTaskStatus = {
  Completed: "completed",
  Failed: "failed",
  Killed: "killed",
  Stopped: "stopped",
} as const;

export const ClaudeTag = {
  TaskNotification: "task-notification",
  TaskId: "task-id",
  ToolUseId: "tool-use-id",
  Status: "status",
} as const;

export const ClaudeField = {
  RunInBackground: "run_in_background",
  TimeoutMs: "timeout_ms",
  Description: "description",
  BackgroundTaskId: "backgroundTaskId",
  TaskId: "taskId",
  AgentId: "agentId",
  IsAsync: "isAsync",
  Status: "status",
} as const;

export const ClaudeResult = {
  AsyncLaunched: "async_launched",
  AsyncPrefix: "Async agent launched",
  IdWords: /\bID: (\w+)|\(task (\w+)/,
} as const;

export const ClaudeNoise = {
  Prefixes: [
    "<command-",
    "<local-command",
    "<system-reminder",
    "<task-notification",
    "Caveat: The messages below",
    "[Request interrupted by user",
  ] as readonly string[],
  PastedContent: /^\n*<pasted_content id="([^"\s<>]+)">\n([\s\S]*)\n<\/pasted_content(?: id="\1")?>\n?$/,
  CompactFailure: "Error during compaction",
  LocalStderr: "<local-command-stderr>",
} as const;

export const ClaudeScan = {
  ChunkBytes: 1_048_576,
  BoundaryWord: "compact_boundary",
} as const;

export const ClaudeModel = {
  Synthetic: "<synthetic>",
} as const;

export const ClaudeWindow = {
  Default: 200_000,
  Long: 1_000_000,
  Sizes: [200_000, 1_000_000],
  LongSuffix: "[1m]",
  Family: /(?:opus|sonnet)-(\d+)(?:[-.](\d{1,2})(?!\d))?/,
  LongMajor: 4,
  LongMinor: 6,
} as const;

export const ClaudeWindowBasis = {
  Suffix: "suffix",
  Family: "family",
  Default: "default",
} as const;

export type ClaudeWindowBasis = (typeof ClaudeWindowBasis)[keyof typeof ClaudeWindowBasis];
