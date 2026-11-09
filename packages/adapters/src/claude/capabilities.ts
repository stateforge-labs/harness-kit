import { CapabilityName, Engine, supported, unsupported, UnsupportedReason, type Capabilities } from "../core/capability.ts";

export const CLAUDE_CAPABILITIES: Capabilities = {
  [CapabilityName.Effort]: { [Engine.Cli]: supported },
  [CapabilityName.StructuredOutput]: { [Engine.Cli]: unsupported(UnsupportedReason.NotImplemented) },
  [CapabilityName.SessionsDelete]: { [Engine.Cli]: unsupported(UnsupportedReason.NotImplemented) },
  [CapabilityName.Ephemeral]: { [Engine.Cli]: supported },
  [CapabilityName.Cost]: { [Engine.Cli]: supported },
  [CapabilityName.SettingsSources]: { [Engine.Cli]: supported },
};
