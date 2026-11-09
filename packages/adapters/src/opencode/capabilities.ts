import { CapabilityName, cell, unmeasuredSupport, unsupported, UnsupportedReason, type Capabilities } from "../core/capability.ts";

export const OPENCODE_BUILTINS_OFF = unmeasuredSupport("does a V2 permissions deny list hide every built-in tool, including skill and the opencode_* meta tools?");
export const OPENCODE_MCP_NONE = unmeasuredSupport("does an empty config directory leave no MCP server configured for a headless run?");
export const OPENCODE_SETTINGS_SKIP = unmeasuredSupport("does any OpenCode flag or env skip user config for a headless run?");
export const OPENCODE_EPHEMERAL = unmeasuredSupport("does `session delete` reach a `--standalone` run's session?");
export const OPENCODE_CLOSED_ENV = unmeasuredSupport("does a closed environment keep an OpenCode headless run working?");
export const OPENCODE_BASE_URL = unmeasuredSupport("which config key points an OpenCode run at another base url?");
export const AGENT_UNMEASURED = "has this harness been measured for the agent facet?";

export const OPENCODE_CAPABILITIES: Capabilities = {
  [CapabilityName.Effort]: cell(unmeasuredSupport("2.2.6 documents provider/model#variant in --model; is there an effort flag?")),
  [CapabilityName.StructuredOutput]: cell(unmeasuredSupport("does OpenCode 2.2.6 run have a structured output flag?")),
  [CapabilityName.SessionsDelete]: cell(unsupported(UnsupportedReason.NotImplemented)),
  [CapabilityName.Ephemeral]: cell(OPENCODE_EPHEMERAL),
  [CapabilityName.Cost]: cell(unmeasuredSupport("committed capture is an error stream; does the real 2.2.6 step_finish carry cost?")),
  [CapabilityName.SettingsSources]: cell(OPENCODE_SETTINGS_SKIP),
  [CapabilityName.BuiltinToolsOff]: cell(OPENCODE_BUILTINS_OFF),
  [CapabilityName.McpNone]: cell(OPENCODE_MCP_NONE),
  [CapabilityName.McpAllowlist]: cell(unsupported(UnsupportedReason.EngineLimit)),
  [CapabilityName.ClosedEnv]: cell(OPENCODE_CLOSED_ENV),
  [CapabilityName.BaseUrl]: cell(OPENCODE_BASE_URL),
  [CapabilityName.Resume]: cell(unmeasuredSupport(AGENT_UNMEASURED)),
  [CapabilityName.ResumeCheckpoint]: cell(unmeasuredSupport(AGENT_UNMEASURED)),
  [CapabilityName.PerTurnUsage]: cell(unmeasuredSupport(AGENT_UNMEASURED)),
  [CapabilityName.UnknownToolDetection]: cell(unmeasuredSupport(AGENT_UNMEASURED)),
  [CapabilityName.SessionStore]: cell(unmeasuredSupport(AGENT_UNMEASURED)),
};
