import { CapabilityName, cell, SDK_NOT_BUILT, supported, unsupported, UnsupportedReason, type Capabilities } from "../core/capability.ts";

export const CLAUDE_CAPABILITIES: Capabilities = {
  [CapabilityName.Effort]: cell(supported),
  [CapabilityName.StructuredOutput]: cell(unsupported(UnsupportedReason.NotImplemented)),
  [CapabilityName.SessionsDelete]: cell(unsupported(UnsupportedReason.NotImplemented)),
  [CapabilityName.Ephemeral]: cell(supported),
  [CapabilityName.Cost]: cell(supported),
  [CapabilityName.SettingsSources]: cell(supported),
  [CapabilityName.BuiltinToolsOff]: cell(supported),
  [CapabilityName.McpNone]: cell(supported),
  [CapabilityName.McpAllowlist]: cell(unsupported(UnsupportedReason.EngineLimit)),
  [CapabilityName.ClosedEnv]: cell(supported),
  [CapabilityName.BaseUrl]: cell(supported),
  [CapabilityName.Resume]: cell(SDK_NOT_BUILT),
  [CapabilityName.ResumeCheckpoint]: cell(SDK_NOT_BUILT),
  [CapabilityName.PerTurnUsage]: cell(SDK_NOT_BUILT),
  [CapabilityName.UnknownToolDetection]: cell(SDK_NOT_BUILT),
  [CapabilityName.SessionStore]: cell(SDK_NOT_BUILT),
};
