export const AgentEventKind = { Recovered: "recovered" } as const;

export const HookPoint = { PreTool: "pre-tool", PostTool: "post-tool", Stop: "stop", SessionStart: "session-start", PromptSubmit: "prompt-submit" } as const;
export type HookPoint = (typeof HookPoint)[keyof typeof HookPoint];

export const AgentWhy = {
  CliEngine: "agent-runs-use-the-sdk-engine",
  NeedsClosedEnv: "agent-env-must-be-closed",
  NeedsBaseUrl: "agent-credential-needs-base-url",
  NeedsEndpointList: "agent-mcp-must-be-an-endpoint-list",
} as const;

export const AgentMessage = {
  EngineUnavailable: "no agent engine is registered for this harness",
} as const;
