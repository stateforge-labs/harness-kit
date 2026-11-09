import { CapabilityName, Engine, unmeasuredSupport, unsupported, UnsupportedReason, type Capabilities } from "../core/capability.ts";

export const OPENCODE_CAPABILITIES: Capabilities = {
  [CapabilityName.Effort]: {
    [Engine.Cli]: unmeasuredSupport("2.2.6 documents provider/model#variant in --model; is there an effort flag?"),
  },
  [CapabilityName.StructuredOutput]: {
    [Engine.Cli]: unmeasuredSupport("does OpenCode 2.2.6 run have a structured output flag?"),
  },
  [CapabilityName.SessionsDelete]: { [Engine.Cli]: unsupported(UnsupportedReason.NotImplemented) },
  [CapabilityName.Ephemeral]: {
    [Engine.Cli]: unmeasuredSupport("does `session delete` reach a `--standalone` run's session?"),
  },
  [CapabilityName.Cost]: {
    [Engine.Cli]: unmeasuredSupport("committed capture is an error stream; does the real 2.2.6 step_finish carry cost?"),
  },
  [CapabilityName.SettingsSources]: {
    [Engine.Cli]: unmeasuredSupport("does any OpenCode flag or env skip user config for a headless run?"),
  },
};
