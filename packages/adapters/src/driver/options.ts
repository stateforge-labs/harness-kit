import { Harness } from "@stateforge-labs/harness-hooks";
import { CapabilityName, type Capabilities, ENGINE_CAPABILITY, Engine, isUsable, supportWhy, UnsupportedReason } from "../core/capability.ts";
import { CredentialMode, presentNames, type CredentialPlan, unsupportedFailure } from "../core/credential-plan.ts";
import { EngineMessage } from "../core/engine-constants.ts";
import { MeasuredState, measuredValue } from "../core/evidence.ts";
import { CredentialUnsupportedReason, type RunFailure } from "../core/failure.ts";
import { gatesFor } from "../core/kit.ts";
import { type ConfinementCell, confine, EnvKind, ToolSetting } from "../core/policy.ts";
import { fail, ok, type Result } from "../core/result.ts";
import type { HeadlessOptions, Limits, Plan, RunRequest } from "../core/run.ts";
import type { EnvSource } from "../env.ts";
import { PLACEHOLDER_OUT_FILE, PLACEHOLDER_RUN_ID, PlanNote } from "./constants.ts";
import type { EngineDescription, EngineImpl } from "./engine.ts";
import { baseEnv, buildChildEnv, type ChildEnv, type EnvBase } from "./env-plan.ts";
import { type Merged, mergeOptions } from "./options-merge.ts";
import type { HarnessDriver, ResolvedOptions } from "./port.ts";

export interface RunControls {
  readonly timeoutMs: number | null;
  readonly signal: AbortSignal | null;
  readonly limits: Limits;
}

export interface Prepared<I extends string> {
  readonly plan: Plan;
  readonly resolved: ResolvedOptions;
  readonly credentialPlan: CredentialPlan;
  readonly engine: EngineImpl<I>;
  readonly request: RunRequest;
  readonly controls: RunControls;
  readonly confinement: readonly ConfinementCell[];
  readonly privateCwd: "delete" | "keep" | null;
  readonly nestedEnv: readonly string[];
  childEnv(): ChildEnv;
}

export interface PrepareDeps<I extends string> {
  readonly driver: HarnessDriver<I>;
  readonly options: HeadlessOptions<I>;
  readonly request: RunRequest;
  readonly base: EnvSource;
  readonly cwd: string;
  readonly allowedModes?: readonly string[];
}

function byteLength(text: string | null): number {
  return text === null ? 0 : new TextEncoder().encode(text).byteLength;
}

function userSettingsOpen(harness: string, mode: string, settings: string): boolean {
  return harness === Harness.Claude && settings !== ToolSetting.None && (mode === CredentialMode.ApiKey || mode === CredentialMode.Cloud);
}

function planNotes(harness: string, mode: string, settings: string, argvCarries: readonly string[], injected: readonly string[]): string[] {
  const notes: string[] = [];
  if (argvCarries.length > 0) {
    notes.push(PlanNote.ArgvExposure);
  }
  if (userSettingsOpen(harness, mode, settings)) {
    notes.push(PlanNote.ClaudeSettingsMayOverride, PlanNote.ClaudeApiKeyHelperUnmeasured);
  }
  if (harness === Harness.OpenCode && injected.length > 0) {
    notes.push(PlanNote.OpencodeInjectionUnmeasured);
  }
  notes.push(PlanNote.EnvBytesNotCounted);
  return notes;
}

function engineFor<I extends string>(driver: HarnessDriver<I>, wanted: Engine): Result<EngineImpl<I>, RunFailure> {
  const impl = wanted === Engine.Sdk ? driver.run.sdk : driver.run.cli;
  if (impl === undefined || !driver.run.engines.includes(wanted)) {
    return fail({ kind: "unsupported", message: EngineMessage.EngineUnsupported, capability: ENGINE_CAPABILITY, engine: wanted, why: UnsupportedReason.NotImplemented });
  }
  return ok(impl);
}

function modeGate(allowed: readonly string[] | undefined, mode: string): RunFailure | null {
  return allowed === undefined || allowed.includes(mode) ? null : unsupportedFailure(mode, CredentialUnsupportedReason.ModeNotAllowed);
}

function baseUrlGate(caps: Capabilities, engine: Engine, baseUrl: unknown): RunFailure | null {
  if (baseUrl === undefined) {
    return null;
  }
  const support = caps[CapabilityName.BaseUrl][engine];
  return isUsable(support)
    ? null
    : { kind: "unsupported", message: EngineMessage.BaseUrlUnsupported, capability: CapabilityName.BaseUrl, engine, why: supportWhy(support), support };
}

function closedGate<I extends string>(driver: HarnessDriver<I>, engine: Engine, m: Merged): RunFailure | null {
  if (m.env.kind !== EnvKind.Closed) {
    return null;
  }
  const support = driver.capabilities[CapabilityName.ClosedEnv][engine];
  if (!isUsable(support)) {
    return { kind: "unsupported", message: EngineMessage.ClosedEnvUnsupported, capability: CapabilityName.ClosedEnv, engine, why: supportWhy(support), support };
  }
  const quiet = driver.profile.quiet;
  if (m.env.quiet === true && measuredValue(quiet) === null) {
    return { kind: "unsupported", message: EngineMessage.ClosedEnvUnsupported, capability: CapabilityName.ClosedEnv, engine, why: quiet.state === MeasuredState.Unmeasured ? quiet.question : EngineMessage.QuietUnmeasured };
  }
  return null;
}

function describedAs<I extends string>(driver: HarnessDriver<I>, engine: Engine): EngineDescription {
  return engine === Engine.Sdk
    ? { engine: Engine.Sdk, entry: driver.profile.binary, env: [] }
    : { engine: Engine.Cli, binary: driver.profile.binary, args: [], stdinBytes: 0, argvCarries: [], env: [] };
}

function toolsSummary(m: Merged): Readonly<Record<string, unknown>> {
  const mcp = m.tools.mcp;
  return { builtins: m.tools.builtins, mcp: typeof mcp === "string" ? mcp : mcp.map((endpoint) => endpoint.name), settings: m.tools.settings, strict: m.tools.strict };
}

function uniqueNames(...lists: readonly (readonly string[])[]): string[] {
  return [...new Set(lists.flat())];
}

export function prepare<I extends string>(deps: PrepareDeps<I>): Result<Prepared<I>, RunFailure> {
  const merged = mergeOptions(deps.options, deps.request, deps.cwd);
  if (!merged.ok) {
    return fail(merged.failure);
  }
  const m = merged.value;
  const credential = deps.options.credential;
  const driver = deps.driver;
  const gate =
    modeGate(deps.allowedModes, credential.mode) ??
    baseUrlGate(driver.capabilities, m.engine, (credential as { readonly baseUrl?: unknown }).baseUrl) ??
    closedGate(driver, m.engine, m);
  if (gate !== null) {
    return fail(gate);
  }
  const selected = engineFor(driver, m.engine);
  if (!selected.ok) {
    return fail(selected.failure);
  }
  const engine = selected.value;
  const confinement = confine(m.tools, driver.capabilities, m.engine);
  if (!confinement.ok) {
    return fail(confinement.failure);
  }
  const envBase = baseEnv(deps.base, m.env, measuredValue(driver.profile.quiet));
  if (!envBase.ok) {
    return fail(envBase.failure);
  }
  const base: EnvBase = envBase.value;
  const credentialPlan = driver.credentials.plan({ credential, env: base.env });
  if (!credentialPlan.ok) {
    return fail(credentialPlan.failure);
  }
  const resolved: ResolvedOptions = {
    model: m.model,
    effort: m.effort,
    persist: m.persist,
    maxArgvBytes: m.maxArgvBytes,
    cwd: m.cwd,
    tools: m.tools,
  };
  const limitGate = gatesFor(driver.capabilities, resolved);
  if (limitGate !== null) {
    return fail(limitGate);
  }
  const request = deps.request;
  const described = engine.describe?.({ options: resolved, credential, instructions: request.instructions, input: request.input, outFile: PLACEHOLDER_OUT_FILE, runId: PLACEHOLDER_RUN_ID });
  if (described !== undefined && !described.ok) {
    return fail(described.failure);
  }
  const description = described === undefined ? describedAs(driver, m.engine) : described.value;
  const nestedEnv = measuredValue(driver.profile.nestedEnv) ?? [];
  const injected = Object.keys(credentialPlan.value.inject);
  const argvCarries = description.engine === Engine.Cli ? description.argvCarries : [];
  const planBase = {
    harness: driver.id,
    options: {
      model: m.model,
      effort: m.effort,
      persist: m.persist,
      maxArgvBytes: m.maxArgvBytes,
      timeoutMs: m.timeoutMs,
      cwd: m.cwd,
      limits: m.limits,
      tools: toolsSummary(m),
    },
    env: {
      kind: base.kind,
      inject: injected,
      strip: base.kind === EnvKind.Inherit ? presentNames(base.env, credentialPlan.value.strip) : [],
      set: uniqueNames(base.set, description.env),
    },
    cwd: { kind: m.privateCwd === null ? ("given" as const) : ("private" as const), retain: m.privateCwd },
    confinement: confinement.value,
    notes: planNotes(driver.id, credentialPlan.value.mode, m.tools.settings, argvCarries, injected),
  };
  const plan: Plan =
    description.engine === Engine.Cli
      ? { ...planBase, engine: Engine.Cli, binary: description.binary, args: description.args, stdinBytes: description.stdinBytes, argvCarries: description.argvCarries }
      : { ...planBase, engine: Engine.Sdk, entry: description.entry };
  const childEnv = (): ChildEnv => buildChildEnv({ base, plan: credentialPlan.value, nestedEnv });
  return ok({
    plan,
    resolved,
    credentialPlan: credentialPlan.value,
    engine,
    request,
    controls: { timeoutMs: m.timeoutMs, signal: m.signal, limits: m.limits },
    confinement: confinement.value,
    privateCwd: m.privateCwd,
    nestedEnv,
    childEnv,
  });
}
