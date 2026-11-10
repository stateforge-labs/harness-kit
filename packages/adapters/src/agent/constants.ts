import { Harness } from "@stateforge-labs/harness-hooks";
import { emulated, supported, unmeasuredSupport, type Support } from "../core/capability.ts";

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
  CliEngine: "agent runs use the sdk engine",
  NeedsClosedEnv: "an agent run needs a closed environment",
  NeedsBaseUrl: "an agent credential needs a base url",
  NeedsEndpointList: "an agent run needs its MCP endpoints as a list",
  BadOptions: "the agent options are not an object",
  BadStart: "the agent start is not an object",
  BadDir: "an agent directory must be an absolute path",
  MissingDir: "an agent directory does not exist",
  BadMaxTurns: "maxTurns must be a positive integer",
  BadTimeout: "a timeout must be a positive integer number of milliseconds",
  BadText: "this field must be a string",
  BadSchema: "the output schema must be a JSON object",
  BadResume: "the resume session id must be a non-empty string",
  BadCheckpoint: "the resume checkpoint must be a non-empty string",
  BadRecoveryPrompt: "the recovery prompt must be a non-empty string",
  BadStore: "the transcript store needs append, load and listSubkeys",
  BadHooks: "the hook target needs a pipeline",
  BadMcpLimit: "the MCP output limit must be a positive integer",
  Cancelled: "the agent run was cancelled",
  TimedOut: "the agent run exceeded its time limit",
  IdleTimedOut: "the agent run produced no event within its idle limit",
  InternalError: "the agent run failed internally",
} as const;

export const AgentField = {
  Options: "options",
  Start: "start",
  Env: "env",
  BaseUrl: "credential.baseUrl",
  Mcp: "tools.mcp",
  Cwd: "dirs.cwd",
  Home: "dirs.home",
  ConfigDir: "dirs.configDir",
  TmpDir: "dirs.tmpDir",
  TimeoutMs: "timeoutMs",
  IdleTimeoutMs: "idleTimeoutMs",
  MaxTurns: "maxTurns",
  Instructions: "instructions",
  Prompt: "prompt",
  OutputSchema: "outputSchema",
  ResumeSession: "resume.sessionId",
  ResumeCheckpoint: "resume.checkpoint",
  RecoveryPrompt: "resume.recoveryPrompt",
  Store: "store",
  Hooks: "hooks",
  McpOutputTokens: "limits.mcpOutputTokens",
} as const;

export const AbortReason = {
  Cancelled: "cancelled",
  Timeout: "timeout",
  Idle: "idle",
  Aborted: "aborted",
} as const;
export type AbortReason = (typeof AbortReason)[keyof typeof AbortReason];

export const BEARER_SLOT = "AGENT_MCP_BEARER_";
export const AGENT_MODE = "api-key";
export const RECOVERY_RUN_SUFFIX = "-recovery";
export const SCRUB_DEPTH = 64;
export const SESSION_NOT_FOUND = "session-not-found";
export const NO_SOURCE: Readonly<Record<string, string>> = Object.freeze({});

export const AgentLabel = {
  Facet: "agent",
  Run: "agent run",
} as const;

const CLAUDE_SESSION_START_HOW = "the SDK never fires SessionStart; the first prompt-submit carries the session context";

function allPoints(support: Support): Readonly<Record<HookPoint, Support>> {
  return {
    [HookPoint.PreTool]: support,
    [HookPoint.PostTool]: support,
    [HookPoint.Stop]: support,
    [HookPoint.SessionStart]: support,
    [HookPoint.PromptSubmit]: support,
  };
}

const HOOKS_UNMEASURED = unmeasuredSupport("have this harness's hook points been measured under its SDK?");

export const HOOK_SUPPORT_UNKNOWN: Readonly<Record<HookPoint, Support>> = allPoints(HOOKS_UNMEASURED);

export const HOOK_SUPPORT: Readonly<Record<string, Readonly<Record<HookPoint, Support>>>> = {
  [Harness.Claude]: { ...allPoints(supported), [HookPoint.SessionStart]: emulated(CLAUDE_SESSION_START_HOW) },
  [Harness.Codex]: HOOK_SUPPORT_UNKNOWN,
  [Harness.OpenCode]: HOOK_SUPPORT_UNKNOWN,
};
