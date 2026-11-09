/** The execution engine: the harness CLI, or its SDK. */
export const Engine = { Cli: "cli", Sdk: "sdk" } as const;
export type Engine = (typeof Engine)[keyof typeof Engine];

export const UnsupportedReason = {
  HarnessLimit: "harness-limit",
  EngineLimit: "engine-limit",
  NotImplemented: "not-implemented",
} as const;
export type UnsupportedReason = (typeof UnsupportedReason)[keyof typeof UnsupportedReason];

export const SupportState = {
  Supported: "supported",
  Emulated: "emulated",
  Unsupported: "unsupported",
  Unmeasured: "unmeasured",
} as const;
export type SupportState = (typeof SupportState)[keyof typeof SupportState];

/** Whether a capability works, per engine. */
export type Support =
  | { readonly state: "supported" }
  | { readonly state: "emulated"; readonly how: string }
  | { readonly state: "unsupported"; readonly reason: UnsupportedReason }
  | { readonly state: "unmeasured"; readonly question: string };

export const CapabilityName = {
  Effort: "effort",
  StructuredOutput: "structured-output",
  SessionsDelete: "sessions-delete",
  Ephemeral: "ephemeral",
  Cost: "cost",
  SettingsSources: "settings-sources",
  BuiltinToolsOff: "builtin-tools-off",
  McpNone: "mcp-none",
  McpAllowlist: "mcp-allowlist",
  ClosedEnv: "closed-env",
  BaseUrl: "base-url",
  Resume: "resume",
  ResumeCheckpoint: "resume-checkpoint",
  PerTurnUsage: "per-turn-usage",
  UnknownToolDetection: "unknown-tool-detection",
  SessionStore: "session-store",
} as const;
export type CapabilityName = (typeof CapabilityName)[keyof typeof CapabilityName];

export const ENGINE_CAPABILITY = "engine";

/** The support of one capability on every engine. */
export type Cell = { readonly [E in Engine]: Support };

export type Capabilities = Readonly<Record<CapabilityName, Cell>>;

export const supported: Support = { state: SupportState.Supported };

export function unsupported(reason: UnsupportedReason): Support {
  return { state: SupportState.Unsupported, reason };
}

export const SDK_NOT_BUILT: Support = unsupported(UnsupportedReason.NotImplemented);

export function cell(cli: Support, sdk: Support = SDK_NOT_BUILT): Cell {
  return { [Engine.Cli]: cli, [Engine.Sdk]: sdk };
}

export const AGENT_CELLS = [
  CapabilityName.BuiltinToolsOff,
  CapabilityName.McpAllowlist,
  CapabilityName.ClosedEnv,
  CapabilityName.SettingsSources,
  CapabilityName.Resume,
  CapabilityName.ResumeCheckpoint,
  CapabilityName.PerTurnUsage,
  CapabilityName.StructuredOutput,
  CapabilityName.UnknownToolDetection,
  CapabilityName.SessionStore,
  CapabilityName.Ephemeral,
] as const satisfies readonly CapabilityName[];
export type AgentCell = (typeof AGENT_CELLS)[number];

export function emulated(how: string): Support {
  return { state: SupportState.Emulated, how };
}

export function unmeasuredSupport(question: string): Support {
  return { state: SupportState.Unmeasured, question };
}

/** True when the cell is supported or emulated, so the capability can be relied on. */
export function isUsable(support: Support): boolean {
  return support.state === SupportState.Supported || support.state === SupportState.Emulated;
}

/** The reason a cell is unsupported, or the open question of an unmeasured cell. */
export function supportWhy(support: Support): string {
  if (support.state === SupportState.Unsupported) {
    return support.reason;
  }
  if (support.state === SupportState.Unmeasured) {
    return support.question;
  }
  if (support.state === SupportState.Emulated) {
    return support.how;
  }
  return "";
}
