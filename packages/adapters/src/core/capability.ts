/** The execution engine. 0.2.0 has only the CLI. */
export const Engine = { Cli: "cli" } as const;
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
} as const;
export type CapabilityName = (typeof CapabilityName)[keyof typeof CapabilityName];

export type Capabilities = Readonly<Record<CapabilityName, { readonly [E in Engine]: Support }>>;

export const supported: Support = { state: SupportState.Supported };

export function unsupported(reason: UnsupportedReason): Support {
  return { state: SupportState.Unsupported, reason };
}

export function emulated(how: string): Support {
  return { state: SupportState.Emulated, how };
}

export function unmeasuredSupport(question: string): Support {
  return { state: SupportState.Unmeasured, question };
}

export function isUsable(support: Support): boolean {
  return support.state === SupportState.Supported || support.state === SupportState.Emulated;
}
