export const CodexDir = {
  Sessions: "sessions",
} as const;

export const CodexScan = {
  DaysBack: 14,
  Candidates: 200,
  HeadBytes: 64 * 1024,
  DayMs: 86_400_000,
} as const;

export const CodexType = {
  SessionMeta: "session_meta",
  TurnContext: "turn_context",
  EventMsg: "event_msg",
  ResponseItem: "response_item",
  Compacted: "compacted",
  WorldState: "world_state",
  TokenUsageRecord: "token_usage_record",
  InterAgentMetadata: "inter_agent_communication_metadata",
} as const;

export const CodexEvent = {
  TaskStarted: "task_started",
  TokenCount: "token_count",
  ThreadSettingsApplied: "thread_settings_applied",
  ItemCompleted: "item_completed",
  TaskComplete: "task_complete",
  TurnAborted: "turn_aborted",
  ThreadGoalUpdated: "thread_goal_updated",
} as const;

export const CodexItem = {
  Message: "message",
  FunctionCall: "function_call",
  FunctionCallOutput: "function_call_output",
  CustomToolCall: "custom_tool_call",
  CustomToolCallOutput: "custom_tool_call_output",
  Reasoning: "reasoning",
  AgentMessage: "agent_message",
  AdditionalTools: "additional_tools",
} as const;

export const CodexRoleName = {
  User: "user",
  Assistant: "assistant",
  Developer: "developer",
} as const;

export const CodexField = {
  Id: "id",
  Cwd: "cwd",
  Timestamp: "timestamp",
  CliVersion: "cli_version",
  Type: "type",
  Payload: "payload",
  Model: "model",
  Info: "info",
  LastTokenUsage: "last_token_usage",
  TotalTokenUsage: "total_token_usage",
  TotalTokens: "total_tokens",
  ModelContextWindow: "model_context_window",
  CallId: "call_id",
  Name: "name",
  Arguments: "arguments",
  Input: "input",
  Output: "output",
  Text: "text",
  Role: "role",
  CellId: "cell_id",
} as const;

export const CodexToolName = {
  Wait: "wait",
} as const;

export const CodexMarker = {
  ScriptRunning: "Script running with cell ID",
  ScriptCompleted: "Script completed",
  InputText: "input_text",
} as const;

export const CodexInjected = {
  Prefixes: [
    "<environment_context",
    "<user_instructions",
    "# AGENTS.md",
    "<user_shell_command>",
    "<recommended_plugins>",
    "<model_switch>",
  ],
} as const;

export const CodexCli = {
  Binary: "codex",
  Exec: "exec",
  Ephemeral: "--ephemeral",
  SkipGitRepoCheck: "--skip-git-repo-check",
  IgnoreUserConfig: "--ignore-user-config",
  Sandbox: "-s",
  ReadOnly: "read-only",
  Color: "--color",
  ColorNever: "never",
  Model: "-m",
  Config: "-c",
  ReasoningEffortKey: "model_reasoning_effort",
  Disable: "--disable",
  Output: "-o",
  Stdin: "-",
  Version: "--version",
} as const;

export const CodexFeatureName = {
  MultiAgent: "multi_agent",
  Plugins: "plugins",
  BrowserUse: "browser_use",
  ComputerUse: "computer_use",
  SkillSearch: "skill_search",
  ToolSuggest: "tool_suggest",
  Hooks: "hooks",
} as const;

export const CodexAuthFile = {
  Auth: "auth.json",
  Config: "config.toml",
} as const;

export const CodexKeyringSetting = {
  Pattern: /cli_auth_credentials_store\s*=\s*"keyring"/,
} as const;

export const CodexStdout = {
  Session: /^session id: (\S+)/m,
  Model: /^model: (\S+)/m,
  Tokens: /tokens used\s*\n\s*([\d,]+)/,
  Grouping: /,/g,
} as const;
