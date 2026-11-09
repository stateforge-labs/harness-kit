import { EnvVar } from "../env.ts";

export const ClaudeCloudSelector = {
  Bedrock: "bedrock",
  Vertex: "vertex",
  Foundry: "foundry",
} as const;

export const ClaudeCloudEnv: Readonly<Record<string, string>> = {
  [ClaudeCloudSelector.Bedrock]: EnvVar.ClaudeCodeUseBedrock,
  [ClaudeCloudSelector.Vertex]: EnvVar.ClaudeCodeUseVertex,
  [ClaudeCloudSelector.Foundry]: EnvVar.ClaudeCodeUseFoundry,
};

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

export const ClaudeCli = {
  Binary: "claude",
  Print: "-p",
  Model: "--model",
  NoSessionPersistence: "--no-session-persistence",
  Tools: "--tools",
  SettingSources: "--setting-sources",
  StrictMcpConfig: "--strict-mcp-config",
  OutputFormat: "--output-format",
  OutputJson: "json",
  SystemPrompt: "--system-prompt",
  Effort: "--effort",
  Version: "--version",
} as const;

export const ClaudeSettingSources = {
  NoUser: "project,local",
} as const;

export const ClaudeResultField = {
  Result: "result",
  TotalCostUsd: "total_cost_usd",
  IsError: "is_error",
  SessionId: "session_id",
  Usage: "usage",
  ModelUsage: "modelUsage",
} as const;

export const ClaudePolicy = {
  RetrievedAt: "2026-11-09",
  Quotes: [
    {
      text: "Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK. Use the API key authentication methods described in the Quickstart instead.",
      source: "https://code.claude.com/docs/en/agent-sdk/overview",
    },
    {
      text: "OAuth authentication is intended exclusively for purchasers of Claude Free, Pro, Max, Ultra, Team, and Enterprise subscription plans and is designed to support ordinary use of Claude Code and other native Anthropic applications.",
      source: "https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use",
    },
    {
      text: "Developers building products or services that interact with Claude's capabilities, including those using the Agent SDK, should use API key authentication through Claude Console or a supported cloud provider. Anthropic does not permit third-party developers to offer Claude.ai login into their own applications, or to route requests through Free, Pro, Max, or Ultra plan credentials on behalf of their users. Moreover, developers may not collect, store, or intermediate Claude.ai credentials or session tokens — sign-in to a Claude account must complete through Anthropic's own flow.",
      source: "https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use",
    },
    {
      text: "This does not restrict how customers provision and manage their own API keys or third-party inference provider credentials — for example, configuring an API key in a development environment, secrets manager, or machine image for use by the customer's own authorized users — provided the resulting usage is billed to the key owner under their agreement with Anthropic (or the applicable provider) and is not resold or intermediated as described above.",
      source: "https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use",
    },
    {
      text: "Nor does it prevent an end user from signing in to the unmodified Claude Code binary with their own Claude subscription, including where a platform hosts Claude Code as described under Can customers offer Claude Code in their products? above.",
      source: "https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use",
    },
    {
      text: "Anthropic reserves the right to take measures to enforce these restrictions and may do so without prior notice.",
      source: "https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use",
    },
    {
      text: "Advertised usage limits for Pro, Max, and Ultra plans assume ordinary, individual usage of Claude Code and the Agent SDK.",
      source: "https://code.claude.com/docs/en/legal-and-compliance#acceptable-use",
    },
  ],
} as const;

export const ClaudeAuthFile = {
  Credentials: ".credentials.json",
} as const;

export const ClaudeArg = {
  Empty: "",
} as const;

export const ClaudeUsageField = {
  Input: "input_tokens",
  Output: "output_tokens",
  CacheRead: "cache_read_input_tokens",
  CacheWrite: "cache_creation_input_tokens",
  Details: "output_tokens_details",
  Thinking: "thinking_tokens",
} as const;

export const ClaudeModelUsageField = {
  CostBasis: "costBasis",
} as const;

