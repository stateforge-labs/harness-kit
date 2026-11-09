import { CapabilityName, cell, emulated, supported, unmeasuredSupport, unsupported, UnsupportedReason, type Capabilities } from "../core/capability.ts";

export const CODEX_TOOLS_OFF_HOW = "read-only sandbox, --ignore-user-config and --disable features; apply_patch and MCP resource tools remain";
export const CODEX_MCP_NONE_HOW = "--ignore-user-config drops configured MCP servers; MCP resource tools remain";
export const CODEX_CLOSED_ENV = "does a closed environment with only CODEX_HOME and PATH keep a headless run working?";
export const CODEX_BASE_URL = "which config key or variable points a codex run at another base url?";
export const AGENT_UNMEASURED = "has this harness been measured for the agent facet?";

export const CODEX_CAPABILITIES: Capabilities = {
  [CapabilityName.Effort]: cell(supported),
  [CapabilityName.StructuredOutput]: cell(unsupported(UnsupportedReason.NotImplemented)),
  [CapabilityName.SessionsDelete]: cell(unsupported(UnsupportedReason.NotImplemented)),
  [CapabilityName.Ephemeral]: cell(supported),
  [CapabilityName.Cost]: cell(unsupported(UnsupportedReason.HarnessLimit)),
  [CapabilityName.SettingsSources]: cell(supported),
  [CapabilityName.BuiltinToolsOff]: cell(emulated(CODEX_TOOLS_OFF_HOW)),
  [CapabilityName.McpNone]: cell(emulated(CODEX_MCP_NONE_HOW)),
  [CapabilityName.McpAllowlist]: cell(unsupported(UnsupportedReason.EngineLimit)),
  [CapabilityName.ClosedEnv]: cell(unmeasuredSupport(CODEX_CLOSED_ENV)),
  [CapabilityName.BaseUrl]: cell(unmeasuredSupport(CODEX_BASE_URL)),
  [CapabilityName.Resume]: cell(unmeasuredSupport(AGENT_UNMEASURED)),
  [CapabilityName.ResumeCheckpoint]: cell(unmeasuredSupport(AGENT_UNMEASURED)),
  [CapabilityName.PerTurnUsage]: cell(unmeasuredSupport(AGENT_UNMEASURED)),
  [CapabilityName.UnknownToolDetection]: cell(unmeasuredSupport(AGENT_UNMEASURED)),
  [CapabilityName.SessionStore]: cell(unmeasuredSupport(AGENT_UNMEASURED)),
};
