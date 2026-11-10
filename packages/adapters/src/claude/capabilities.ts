import { CapabilityName, cell, SDK_NOT_BUILT, supported, unsupported, UnsupportedReason, type Capabilities } from "../core/capability.ts";

export const CLAUDE_CAPABILITIES: Capabilities = {
  [CapabilityName.Effort]: cell(supported),
  [CapabilityName.StructuredOutput]: cell(unsupported(UnsupportedReason.NotImplemented), supported),
  [CapabilityName.SessionsDelete]: cell(unsupported(UnsupportedReason.NotImplemented)),
  [CapabilityName.Ephemeral]: cell(supported, supported),
  [CapabilityName.Cost]: cell(supported),
  [CapabilityName.SettingsSources]: cell(supported, supported),
  [CapabilityName.BuiltinToolsOff]: cell(supported, supported),
  [CapabilityName.McpNone]: cell(supported),
  [CapabilityName.McpAllowlist]: cell(unsupported(UnsupportedReason.EngineLimit), supported),
  [CapabilityName.ClosedEnv]: cell(supported, supported),
  [CapabilityName.BaseUrl]: cell(supported),
  [CapabilityName.Resume]: cell(SDK_NOT_BUILT, supported),
  [CapabilityName.ResumeCheckpoint]: cell(SDK_NOT_BUILT, supported),
  [CapabilityName.PerTurnUsage]: cell(SDK_NOT_BUILT, supported),
  [CapabilityName.UnknownToolDetection]: cell(SDK_NOT_BUILT, supported),
  [CapabilityName.SessionStore]: cell(SDK_NOT_BUILT, supported),
};
