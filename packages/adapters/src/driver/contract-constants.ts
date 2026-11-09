import { CapabilityName } from "../core/capability.ts";
import { type ToolPolicy, ToolSetting } from "../core/policy.ts";
import type { Profile } from "../core/profile.ts";
import { CredentialMode } from "../core/credential-plan.ts";

export const ContractCheckName = {
  ProfileEvidence: "profile-evidence",
  CapabilityCells: "capability-cells",
  SdkColumn: "sdk-column",
  Gating: "gating",
  SupportBehaviour: "support-behaviour",
  CredentialGarbage: "credential-garbage",
  EngineGarbage: "engine-garbage",
  ProfileFields: "profile-fields",
  FixturePlanSecrets: "fixture-plan-secrets",
} as const;
export type ContractCheckName = (typeof ContractCheckName)[keyof typeof ContractCheckName];

export const ContractText = {
  Pass: "ok",
  Threw: "threw ",
  Separator: "; ",
  NoEvidence: "measured fact has no evidence",
  BadEvidence: "evidence is malformed",
  BadQuestion: "unmeasured fact or cell has no question",
  BadState: "support state is not a known state",
  BadReason: "unsupported cell has no known reason",
  MissingCell: "capability cell is missing",
  GateMismatch: "refusal does not match the capability cell",
  SdkUsable: "sdk cell is usable but no sdk engine is built",
  NotRefused: "tools did not refuse a cell the table does not support",
  LaxRefused: "non-strict tools refused a cell that is not unsupported",
  SupportedRefused: "tools refused a supported cell",
  WrongCapability: "refusal names another capability",
  EngineRefusedSupported: "engine refuses a tools cell the table marks supported",
  PlainAccepted: "a plain string secret was accepted",
  PlanFailed: "a valid fixture credential gave no plan",
  SecretLeak: "plan serialises a fixture secret",
  NoSentinel: "no fixture sentinel to scan for",
  MissingField: "profile field is missing",
  NotAFailure: "engine did not return a failure",
  Question: "?",
  NoFixture: "no fixture credential",
} as const;

export const CONTRACT_TOOL_AXES: readonly { readonly capability: CapabilityName; readonly tools: ToolPolicy }[] = [
  { capability: CapabilityName.BuiltinToolsOff, tools: { builtins: ToolSetting.Off, mcp: ToolSetting.HarnessDefault, settings: ToolSetting.HarnessDefault } },
  { capability: CapabilityName.McpNone, tools: { builtins: ToolSetting.HarnessDefault, mcp: [], settings: ToolSetting.HarnessDefault } },
  { capability: CapabilityName.SettingsSources, tools: { builtins: ToolSetting.HarnessDefault, mcp: ToolSetting.HarnessDefault, settings: ToolSetting.None } },
];

export const FailureKind = {
  Unsupported: "unsupported",
} as const;

export const PROFILE_FIELDS = ["id", "binary", "nestedEnv", "model", "effort", "suggested", "limits", "isolation", "quiet", "cli"] as const satisfies readonly (keyof Profile)[];
type MissingProfileField = Exclude<keyof Profile, (typeof PROFILE_FIELDS)[number]>;
export const PROFILE_FIELDS_COMPLETE: [MissingProfileField] extends [never] ? true : never = true;

export const CONTRACT_HOME = "/contract-home";
export const CONTRACT_CWD = "/contract-cwd";
export const CONTRACT_OUT_FILE = "contract-out.txt";
export const CONTRACT_INSTRUCTIONS = "contract instructions";
export const CONTRACT_INPUT = "contract input";
export const CONTRACT_EFFORT = "low";
export const CONTRACT_RUN_ID = "contract-run";
export const CONTRACT_EXIT_CODE = 0;
export const CONTRACT_PLAIN_KEY = "plain";
export const CONTRACT_PLAIN_MODE = CredentialMode.ApiKey;
export const CONTRACT_GARBAGE_TEXT: readonly string[] = ["", "{", "\u0000"];
export const CONTRACT_PLAIN_SPEC = { mode: CONTRACT_PLAIN_MODE, key: CONTRACT_PLAIN_KEY } as const;
export const CONTRACT_GARBAGE_SPECS: readonly unknown[] = [undefined, null, 42, {}, { mode: {} }, CONTRACT_PLAIN_SPEC];

export const FactField = {
  State: "state",
  Evidence: "evidence",
  Question: "question",
  Applied: "applied",
  Kind: "kind",
  Ref: "ref",
  CapturedAt: "capturedAt",
} as const;
