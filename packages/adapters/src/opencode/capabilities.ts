import { CapabilityName, cell, emulated, supported, unmeasuredSupport, unsupported, UnsupportedReason, type Capabilities } from "../core/capability.ts";
import { OPENCODE_MEASURED, OpenCodeToolsOffLeftovers } from "./constants.ts";

export const OPENCODE_TOOLS_OFF_HOW = `permissions deny rules in OPENCODE_CONFIG_CONTENT hide read, edit, glob, grep, shell, subagent, webfetch, websearch, execute and question; the model still lists ${OpenCodeToolsOffLeftovers.join(", ")} (${OPENCODE_MEASURED}); whether those leftovers can run is untested`;
export const OPENCODE_SETTINGS_SKIP_HOW = `an empty OPENCODE_CONFIG_DIR replaces the global config directory and OPENCODE_DISABLE_PROJECT_CONFIG and OPENCODE_DISABLE_CLAUDE_CODE are set; an AGENTS.md marker in the global config was not obeyed, global plugins untested, auth stays in the data directory (${OPENCODE_MEASURED})`;
export const OPENCODE_EPHEMERAL_HOW = `every run leaves a session; session delete --standalone removes it in about 0.24 s after the run (${OPENCODE_MEASURED})`;

export const OPENCODE_BUILTINS_OFF = emulated(OPENCODE_TOOLS_OFF_HOW);
export const OPENCODE_MCP_NONE = unmeasuredSupport("does a deny on the MCP resource tools plus an empty config directory leave no MCP server tool callable in a headless run?");
export const OPENCODE_SETTINGS_SKIP = emulated(OPENCODE_SETTINGS_SKIP_HOW);
export const OPENCODE_EPHEMERAL = emulated(OPENCODE_EPHEMERAL_HOW);
export const OPENCODE_CLOSED_ENV = unmeasuredSupport("does a closed environment keep an OpenCode headless run working?");
export const OPENCODE_BASE_URL = unmeasuredSupport("which config key points an OpenCode run at another base url?");
export const AGENT_UNMEASURED = "has this harness been measured for the agent facet?";
export const OPENCODE_SDK_UNMEASURED = unmeasuredSupport(AGENT_UNMEASURED);
export const OPENCODE_SDK_NO_STORE = unsupported(UnsupportedReason.HarnessLimit);

export const OPENCODE_CAPABILITIES: Capabilities = {
  [CapabilityName.Effort]: cell(unmeasuredSupport("2.2.6 documents provider/model#variant in --model; is there an effort flag?")),
  [CapabilityName.StructuredOutput]: cell(unmeasuredSupport("does OpenCode 2.2.6 run have a structured output flag?"), OPENCODE_SDK_UNMEASURED),
  [CapabilityName.SessionsDelete]: cell(unsupported(UnsupportedReason.NotImplemented)),
  [CapabilityName.Ephemeral]: cell(OPENCODE_EPHEMERAL, OPENCODE_SDK_UNMEASURED),
  [CapabilityName.Cost]: cell(supported),
  [CapabilityName.SettingsSources]: cell(OPENCODE_SETTINGS_SKIP, OPENCODE_SDK_UNMEASURED),
  [CapabilityName.BuiltinToolsOff]: cell(OPENCODE_BUILTINS_OFF, OPENCODE_SDK_UNMEASURED),
  [CapabilityName.McpNone]: cell(OPENCODE_MCP_NONE),
  [CapabilityName.McpAllowlist]: cell(unsupported(UnsupportedReason.EngineLimit), OPENCODE_SDK_UNMEASURED),
  [CapabilityName.ClosedEnv]: cell(OPENCODE_CLOSED_ENV, OPENCODE_SDK_UNMEASURED),
  [CapabilityName.BaseUrl]: cell(OPENCODE_BASE_URL),
  [CapabilityName.Resume]: cell(unmeasuredSupport(AGENT_UNMEASURED), OPENCODE_SDK_UNMEASURED),
  [CapabilityName.ResumeCheckpoint]: cell(unmeasuredSupport(AGENT_UNMEASURED), OPENCODE_SDK_UNMEASURED),
  [CapabilityName.PerTurnUsage]: cell(unmeasuredSupport(AGENT_UNMEASURED), OPENCODE_SDK_UNMEASURED),
  [CapabilityName.UnknownToolDetection]: cell(unmeasuredSupport(AGENT_UNMEASURED), OPENCODE_SDK_UNMEASURED),
  [CapabilityName.SessionStore]: cell(unmeasuredSupport(AGENT_UNMEASURED), OPENCODE_SDK_NO_STORE),
};
