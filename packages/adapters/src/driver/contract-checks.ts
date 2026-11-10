import { AGENT_CELLS, type Capabilities, CapabilityName, Engine, isUsable, type Support, SupportState, UnsupportedReason } from "../core/capability.ts";
import { EvidenceKind, MeasuredState } from "../core/evidence.ts";
import type { Profile } from "../core/profile.ts";
import { ContractText, FactField, PROFILE_FIELDS } from "./contract-constants.ts";

const EVIDENCE_KINDS: readonly string[] = Object.values(EvidenceKind);
const SUPPORT_STATES: readonly string[] = Object.values(SupportState);
const UNSUPPORTED_REASONS: readonly string[] = Object.values(UnsupportedReason);

function evidenceOk(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const kind = Reflect.get(value, FactField.Kind);
  const ref = Reflect.get(value, FactField.Ref);
  const capturedAt = Reflect.get(value, FactField.CapturedAt);
  return typeof kind === "string" && EVIDENCE_KINDS.includes(kind) && typeof ref === "string" && ref !== "" && typeof capturedAt === "string" && capturedAt !== "";
}

function factProblems(value: unknown, at: string): string[] {
  if (typeof value !== "object" || value === null) {
    return [];
  }
  const problems: string[] = [];
  const state = Reflect.get(value, FactField.State);
  if (state === MeasuredState.Measured && !evidenceOk(Reflect.get(value, FactField.Evidence))) {
    problems.push(`${at}: ${ContractText.NoEvidence}`);
  } else if (state === MeasuredState.Unmeasured) {
    const question = Reflect.get(value, FactField.Question);
    if (typeof question !== "string" || !question.endsWith(ContractText.Question)) {
      problems.push(`${at}: ${ContractText.BadQuestion}`);
    }
  } else if (Reflect.get(value, FactField.Applied) === false && !evidenceOk(Reflect.get(value, FactField.Evidence))) {
    problems.push(`${at}: ${ContractText.BadEvidence}`);
  }
  for (const [key, member] of Object.entries(value)) {
    problems.push(...factProblems(member, `${at}.${key}`));
  }
  return problems;
}

export function profileEvidenceProblems(profile: Profile): string[] {
  return factProblems(profile, "profile");
}

export function profileFieldProblems(profile: Profile): string[] {
  return PROFILE_FIELDS.filter((field) => profile[field] === undefined).map((field) => `${field}: ${ContractText.MissingField}`);
}

export function cellOf(caps: Capabilities, name: CapabilityName, engine: Engine = Engine.Cli): Support | undefined {
  const row: Partial<Record<Engine, Support>> | undefined = caps[name];
  return row?.[engine];
}

function cellProblems(name: string, support: Support | undefined): string[] {
  if (support === undefined) {
    return [`${name}: ${ContractText.MissingCell}`];
  }
  if (!SUPPORT_STATES.includes(support.state)) {
    return [`${name}: ${ContractText.BadState}`];
  }
  if (support.state === SupportState.Unsupported && !UNSUPPORTED_REASONS.includes(support.reason)) {
    return [`${name}: ${ContractText.BadReason}`];
  }
  if (support.state === SupportState.Unmeasured && !support.question.endsWith(ContractText.Question)) {
    return [`${name}: ${ContractText.BadQuestion}`];
  }
  return [];
}

export function capabilityProblems(caps: Capabilities): string[] {
  return Object.values(CapabilityName).flatMap((name) => Object.values(Engine).flatMap((engine) => cellProblems(`${name}.${engine}`, cellOf(caps, name, engine))));
}

const AGENT_CELL_NAMES: readonly CapabilityName[] = [...AGENT_CELLS, CapabilityName.BaseUrl, CapabilityName.McpNone];

export function sdkColumnProblems(caps: Capabilities, agentEngine = false): string[] {
  return Object.values(CapabilityName).flatMap((name) => {
    if (agentEngine && AGENT_CELL_NAMES.includes(name)) {
      return [];
    }
    const support = cellOf(caps, name, Engine.Sdk);
    return support !== undefined && isUsable(support) ? [`${name}.${Engine.Sdk}: ${ContractText.SdkUsable}`] : [];
  });
}

