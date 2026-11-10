export const CLAUDE_SDK_VERSION = "0.3.316";

export const SdkRuntime = { Node: "node", Bun: "bun" } as const;
export type SdkRuntime = (typeof SdkRuntime)[keyof typeof SdkRuntime];

export const SdkPlanFacts = {
  Entry: "query",
  Note: "the vendor SDK is loaded on the first start and never at import",
} as const;

export const SdkOption = {
  Tools: "tools",
  StrictMcpConfig: "strictMcpConfig",
  McpServers: "mcpServers",
  SettingSources: "settingSources",
  Env: "env",
  Cwd: "cwd",
  Executable: "executable",
  PathToClaudeCodeExecutable: "pathToClaudeCodeExecutable",
  AbortController: "abortController",
  SystemPrompt: "systemPrompt",
  Model: "model",
  Effort: "effort",
  MaxTurns: "maxTurns",
  OutputFormat: "outputFormat",
  Resume: "resume",
  ResumeSessionAt: "resumeSessionAt",
  PersistSession: "persistSession",
  IncludePartialMessages: "includePartialMessages",
  Hooks: "hooks",
  SessionStore: "sessionStore",
  PermissionMode: "permissionMode",
  AllowedTools: "allowedTools",
  SpawnClaudeCodeProcess: "spawnClaudeCodeProcess",
} as const;

export const SdkPermissionMode = { DontAsk: "dontAsk" } as const;

export const SdkMcp = {
  ServerType: "http",
  AuthorizationHeader: "authorization",
  BearerPrefix: "Bearer ",
  ToolPrefix: "mcp__",
  ToolSeparator: "__",
  EnvPrefix: "AGENT_MCP_BEARER_",
  ExpandOpen: "${",
  ExpandClose: "}",
} as const;

export const SdkOutput = { JsonSchema: "json_schema", StructuredTool: "StructuredOutput" } as const;

export const SdkStore = { NoUuid: "", FlushEager: "eager" } as const;

export const SdkType = {
  System: "system",
  User: "user",
  Assistant: "assistant",
  Result: "result",
  RateLimit: "rate_limit_event",
} as const;

export const SdkSubtype = {
  Init: "init",
  MirrorError: "mirror_error",
  Success: "success",
  MaxTurns: "error_max_turns",
  Execution: "error_during_execution",
  StructuredRetries: "error_max_structured_output_retries",
} as const;

export const SdkField = {
  Type: "type",
  Subtype: "subtype",
  SessionId: "session_id",
  Uuid: "uuid",
  Message: "message",
  Content: "content",
  Usage: "usage",
  Model: "model",
  Id: "id",
  Name: "name",
  Input: "input",
  Text: "text",
  Tools: "tools",
  Parent: "parent_tool_use_id",
  Error: "error",
  Errors: "errors",
  Result: "result",
  IsError: "is_error",
  NumTurns: "num_turns",
  StructuredOutput: "structured_output",
  ApiErrorStatus: "api_error_status",
} as const;

export const SdkUsageField = {
  Input: "input_tokens",
  Output: "output_tokens",
  CacheRead: "cache_read_input_tokens",
  CacheWrite: "cache_creation_input_tokens",
} as const;

export const SDK_STRUCTURED_OUTPUT_TOOL = "StructuredOutput";

export const SdkReason = {
  UnknownTool: "tool-not-listed-at-init",
  StructuredRetries: "structured-output-retries",
  StructuredMissing: "structured-output-missing",
  NoResultMessage: "stream-ended-without-result",
} as const;

export const SdkMatch = {
  Aborted: /aborted by user/i,
  NoSession: /no conversation found/i,
} as const;

export const SdkStatus = { Unauthorized: 401, Forbidden: 403 } as const;

export const SdkMessage = {
  Cancelled: "the agent run was cancelled",
  MaxTurns: "the agent run stopped at the turn limit",
  SdkLoadFailed: "the agent SDK could not be loaded",
  QueryFailed: "the agent SDK could not start the query",
  StreamFailed: "the agent SDK stream failed",
  RunFailed: "the agent run ended with an error",
  AuthRejected: "the agent run was rejected as unauthorised",
  StoreFailed: "the transcript store rejected a write",
  SessionNotFound: "the session to resume was not found",
  NoResult: "the agent stream ended without a result",
  NoStructured: "the agent run produced no structured output",
  StructuredRetries: "the agent could not produce the requested structured output",
  BearerMissing: "the closed environment carries no value for an endpoint bearer",
  McpNotList: "agent runs need an explicit list of MCP endpoints",
  HooksUnavailable: "the hook wiring for the agent SDK is not installed",
  InternalFailure: "the agent engine failed internally",
} as const;

export const SdkConfigField = {
  ToolsMcp: "tools.mcp",
  Env: "env",
} as const;

export const SdkHooks = { Capability: "hooks", Why: "hook-wiring-not-installed" } as const;

export const SdkProcess = {
  StderrBytes: 8192,
  PollMs: 50,
  KillAfterMs: 2500,
  GiveUpMs: 6000,
  Stdio: ["pipe", "pipe", "pipe"],
  WindowsPlatform: "win32",
  ExitEvent: "exit",
  DataEvent: "data",
  Signal: { Kill: "SIGKILL", Probe: 0 },
  Expired: "expired",
} as const;
