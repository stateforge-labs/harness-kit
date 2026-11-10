import { isAbsolute } from "node:path";
import { AGENT_CELLS, CapabilityName, Engine, ENGINE_CAPABILITY, isUsable, SupportState, supportWhy, UnsupportedReason, type AgentCell, type CapabilityName as CapabilityKey, type Support } from "../core/capability.ts";
import { CredentialField, secretOf, unsupportedFailure } from "../core/credential-plan.ts";
import type { CredentialOf } from "../core/credential.ts";
import { EngineMessage } from "../core/engine-constants.ts";
import { MeasuredState, measuredValue } from "../core/evidence.ts";
import { CredentialUnsupportedReason, type RunFailure } from "../core/failure.ts";
import { type ConfinementCell, confine, EnvKind, type McpEndpoint, resolveTools, type EnvPolicy } from "../core/policy.ts";
import { redactor } from "../core/redact.ts";
import { fail, ok, type Result } from "../core/result.ts";
import type { RuntimeFs } from "../core/io.ts";
import { baseEnv, buildChildEnv } from "../driver/env-plan.ts";
import { captureThrow } from "../driver/execute.ts";
import type { HarnessDriver } from "../driver/port.ts";
import { EnvVar } from "../env.ts";
import type { Secret } from "../core/secret.ts";
import { AGENT_MODE, BEARER_SLOT, AgentField, AgentMessage, AgentWhy, HOOK_SUPPORT, HOOK_SUPPORT_UNKNOWN, HookPoint, NO_SOURCE } from "./constants.ts";
import type { AgentEngineImpl } from "./engine.ts";
import type { Agent, AgentOptions, AgentStart } from "./types.ts";

export interface AgentPrepared<I extends string> {
  readonly driver: HarnessDriver<I>;
  readonly engine: AgentEngineImpl<I>;
  readonly options: AgentOptions;
  readonly env: Readonly<Record<string, string>>;
  readonly secrets: readonly string[];
  readonly confinement: readonly ConfinementCell[];
  readonly redact: (text: string) => string;
  readonly strict: boolean;
  readonly capabilities: Agent["capabilities"];
  readonly hooks: Agent["hooks"];
}

export interface PrepareDeps<I extends string> {
  readonly driver: HarnessDriver<I>;
  readonly engine: AgentEngineImpl<I> | undefined;
  readonly options: AgentOptions;
  readonly allowedModes: readonly string[] | undefined;
}

const DIR_FIELDS = [
  [AgentField.Cwd, "cwd"],
  [AgentField.Home, "home"],
  [AgentField.ConfigDir, "configDir"],
  [AgentField.TmpDir, "tmpDir"],
] as const;

function invalid(message: string, field: string): RunFailure {
  return { kind: "invalid-config", message, field };
}

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function isPositiveInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

function engineRefusal(why: string, message: string): RunFailure {
  return { kind: "unsupported", message, capability: ENGINE_CAPABILITY, engine: Engine.Sdk, why };
}

function cellRefusal(capability: CapabilityKey, support: Support, message: string): RunFailure {
  return { kind: "unsupported", message, capability, engine: Engine.Sdk, why: supportWhy(support), support };
}

function sdkSupport<I extends string>(driver: HarnessDriver<I>, capability: CapabilityKey): Support {
  return driver.capabilities[capability][Engine.Sdk];
}

function cellGate<I extends string>(driver: HarnessDriver<I>, capability: CapabilityKey, strict: boolean): RunFailure | null {
  const support = sdkSupport(driver, capability);
  const refused = support.state === SupportState.Unsupported || (strict && support.state !== SupportState.Supported);
  return refused ? cellRefusal(capability, support, EngineMessage.Unsupported) : null;
}

function credentialGate<I extends string>(deps: PrepareDeps<I>): RunFailure | null {
  const credential: unknown = deps.options.credential;
  const mode = isObject(credential) ? credential["mode"] : undefined;
  if (mode !== AGENT_MODE) {
    return unsupportedFailure(typeof mode === "string" ? mode : "", CredentialUnsupportedReason.ModeNotAllowed);
  }
  if (deps.allowedModes !== undefined && !deps.allowedModes.includes(AGENT_MODE)) {
    return unsupportedFailure(AGENT_MODE, CredentialUnsupportedReason.ModeNotAllowed);
  }
  if (!deps.driver.credentials.modes.includes(AGENT_MODE)) {
    return unsupportedFailure(AGENT_MODE, CredentialUnsupportedReason.ModeNotOffered);
  }
  const key = secretOf((credential as Readonly<Record<string, unknown>>)[CredentialField.Key], CredentialField.Key);
  if (!key.ok) {
    return key.failure;
  }
  const baseUrl = (credential as Readonly<Record<string, unknown>>)["baseUrl"];
  return typeof baseUrl === "string" && baseUrl.trim() !== "" ? null : invalid(AgentMessage.NeedsBaseUrl, AgentField.BaseUrl);
}

function dirsGate(options: AgentOptions): RunFailure | null {
  const dirs: unknown = options.dirs;
  for (const [field, name] of DIR_FIELDS) {
    const value = isObject(dirs) ? dirs[name] : undefined;
    if (typeof value !== "string" || !isAbsolute(value)) {
      return invalid(AgentMessage.BadDir, field);
    }
  }
  return null;
}

function shapeGate(options: AgentOptions): RunFailure | null {
  const env: unknown = options.env;
  if (!isObject(env) || env["kind"] !== EnvKind.Closed || !isObject(env["set"])) {
    return invalid(AgentMessage.NeedsClosedEnv, AgentField.Env);
  }
  const tools: unknown = options.tools;
  if (!isObject(tools) || !Array.isArray(tools["mcp"])) {
    return invalid(AgentMessage.NeedsEndpointList, AgentField.Mcp);
  }
  if (options.timeoutMs !== undefined && !isPositiveInteger(options.timeoutMs)) {
    return invalid(AgentMessage.BadTimeout, AgentField.TimeoutMs);
  }
  if (options.idleTimeoutMs !== undefined && !isPositiveInteger(options.idleTimeoutMs)) {
    return invalid(AgentMessage.BadTimeout, AgentField.IdleTimeoutMs);
  }
  return dirsGate(options);
}

function capabilityGate<I extends string>(driver: HarnessDriver<I>, env: Extract<EnvPolicy, { readonly kind: "closed" }>): RunFailure | null {
  const closed = sdkSupport(driver, CapabilityName.ClosedEnv);
  if (!isUsable(closed)) {
    return cellRefusal(CapabilityName.ClosedEnv, closed, EngineMessage.ClosedEnvUnsupported);
  }
  const quiet = driver.profile.quiet;
  if (env.quiet === true && measuredValue(quiet) === null) {
    const why = quiet.state === MeasuredState.Unmeasured ? quiet.question : EngineMessage.QuietUnmeasured;
    return { kind: "unsupported", message: EngineMessage.ClosedEnvUnsupported, capability: CapabilityName.ClosedEnv, engine: Engine.Sdk, why };
  }
  const baseUrl = sdkSupport(driver, CapabilityName.BaseUrl);
  return isUsable(baseUrl) ? null : cellRefusal(CapabilityName.BaseUrl, baseUrl, EngineMessage.BaseUrlUnsupported);
}

export function capabilitiesOf<I extends string>(driver: HarnessDriver<I>): Agent["capabilities"] {
  const out = {} as Record<AgentCell, Support>;
  for (const name of AGENT_CELLS) {
    out[name] = sdkSupport(driver, name);
  }
  return out;
}

export function hooksOf(id: string): Agent["hooks"] {
  return Object.hasOwn(HOOK_SUPPORT, id) ? (HOOK_SUPPORT[id] ?? HOOK_SUPPORT_UNKNOWN) : HOOK_SUPPORT_UNKNOWN;
}

function closedPolicy(options: AgentOptions): EnvPolicy {
  return {
    kind: EnvKind.Closed,
    set: { ...options.env.set, [EnvVar.Home]: options.dirs.home, [EnvVar.Tmpdir]: options.dirs.tmpDir },
    ...(options.env.quiet === undefined ? {} : { quiet: options.env.quiet }),
  };
}

function bearerSlots(options: AgentOptions): Readonly<Record<string, Secret>> {
  const slots: Record<string, Secret> = {};
  (options.tools.mcp as readonly McpEndpoint[]).forEach((endpoint, index) => {
    if (endpoint.bearer !== null) {
      slots[`${BEARER_SLOT}${index}`] = endpoint.bearer;
    }
  });
  return slots;
}

function childEnvOf<I extends string>(driver: HarnessDriver<I>, options: AgentOptions): Result<{ readonly env: Readonly<Record<string, string>>; readonly secrets: readonly string[] }, RunFailure> {
  const base = baseEnv(NO_SOURCE, closedPolicy(options), measuredValue(driver.profile.quiet));
  if (!base.ok) {
    return fail(base.failure);
  }
  const plan = driver.credentials.plan({ credential: options.credential as unknown as CredentialOf<I>, env: base.value.env });
  if (!plan.ok) {
    return fail(plan.failure);
  }
  const slots = bearerSlots(options);
  const child = buildChildEnv({ base: base.value, plan: { ...plan.value, inject: { ...plan.value.inject, ...slots } }, nestedEnv: [] });
  return ok({ env: { ...child.env }, secrets: child.secrets });
}

function prepareChecked<I extends string>(deps: PrepareDeps<I>, engine: AgentEngineImpl<I>): Result<AgentPrepared<I>, RunFailure> {
  const { driver, options } = deps;
  const credential = credentialGate(deps);
  if (credential !== null) {
    return fail(credential);
  }
  const shape = shapeGate(options);
  if (shape !== null) {
    return fail(shape);
  }
  const capability = capabilityGate(driver, options.env);
  if (capability !== null) {
    return fail(capability);
  }
  const tools = resolveTools(options.tools, undefined);
  const confinement = confine(tools, driver.capabilities, Engine.Sdk);
  if (!confinement.ok) {
    return fail(confinement.failure);
  }
  const child = childEnvOf(driver, options);
  if (!child.ok) {
    return fail(child.failure);
  }
  return ok({
    driver,
    engine,
    options,
    env: child.value.env,
    secrets: child.value.secrets,
    confinement: confinement.value,
    redact: redactor(child.value.secrets),
    strict: tools.strict,
    capabilities: capabilitiesOf(driver),
    hooks: hooksOf(driver.id),
  });
}

export function prepareAgent<I extends string>(deps: PrepareDeps<I>): Result<AgentPrepared<I>, RunFailure> {
  const options: unknown = deps.options;
  if (!isObject(options)) {
    return fail(invalid(AgentMessage.BadOptions, AgentField.Options));
  }
  const requested: unknown = options["engine"];
  if (requested !== undefined && requested !== Engine.Sdk) {
    return fail(engineRefusal(AgentWhy.CliEngine, AgentMessage.CliEngine));
  }
  if (deps.engine === undefined) {
    return fail(engineRefusal(UnsupportedReason.NotImplemented, AgentMessage.EngineUnavailable));
  }
  const checked = captureThrow(() => prepareChecked(deps, deps.engine as AgentEngineImpl<I>));
  return checked.ok ? checked.value : fail(invalid(AgentMessage.BadOptions, AgentField.Options));
}

function startShape(start: unknown): RunFailure | null {
  if (!isObject(start)) {
    return invalid(AgentMessage.BadStart, AgentField.Start);
  }
  if (typeof start["instructions"] !== "string") {
    return invalid(AgentMessage.BadText, AgentField.Instructions);
  }
  if (typeof start["prompt"] !== "string") {
    return invalid(AgentMessage.BadText, AgentField.Prompt);
  }
  if (!isPositiveInteger(start["maxTurns"])) {
    return invalid(AgentMessage.BadMaxTurns, AgentField.MaxTurns);
  }
  const schema = start["outputSchema"];
  if (schema !== undefined && (!isObject(schema) || Array.isArray(schema))) {
    return invalid(AgentMessage.BadSchema, AgentField.OutputSchema);
  }
  const limits = start["limits"];
  const mcpLimit = isObject(limits) ? limits["mcpOutputTokens"] : undefined;
  return mcpLimit !== undefined && !isPositiveInteger(mcpLimit) ? invalid(AgentMessage.BadMcpLimit, AgentField.McpOutputTokens) : null;
}

function resumeShape(start: AgentStart): RunFailure | null {
  const resume: unknown = start.resume;
  if (resume === undefined) {
    return null;
  }
  if (!isObject(resume) || !isText(resume["sessionId"])) {
    return invalid(AgentMessage.BadResume, AgentField.ResumeSession);
  }
  if (resume["checkpoint"] !== undefined && !isText(resume["checkpoint"])) {
    return invalid(AgentMessage.BadCheckpoint, AgentField.ResumeCheckpoint);
  }
  return resume["recoveryPrompt"] !== undefined && !isText(resume["recoveryPrompt"]) ? invalid(AgentMessage.BadRecoveryPrompt, AgentField.RecoveryPrompt) : null;
}

function portShape(start: AgentStart): RunFailure | null {
  const store: unknown = start.store;
  if (store !== undefined && (!isObject(store) || typeof store["append"] !== "function" || typeof store["load"] !== "function" || typeof store["listSubkeys"] !== "function")) {
    return invalid(AgentMessage.BadStore, AgentField.Store);
  }
  const hooks: unknown = start.hooks;
  return hooks !== undefined && (!isObject(hooks) || !isObject(hooks["pipeline"])) ? invalid(AgentMessage.BadHooks, AgentField.Hooks) : null;
}

function startCells(start: AgentStart): readonly CapabilityKey[] {
  const wanted: CapabilityKey[] = [];
  if (start.resume !== undefined) {
    wanted.push(CapabilityName.Resume);
    if (start.resume.checkpoint !== undefined) {
      wanted.push(CapabilityName.ResumeCheckpoint);
    }
  }
  if (start.outputSchema !== undefined) {
    wanted.push(CapabilityName.StructuredOutput);
  }
  if (start.store !== undefined) {
    wanted.push(CapabilityName.SessionStore);
  }
  return wanted;
}

function hookGate(prepared: { readonly hooks: Agent["hooks"]; readonly strict: boolean }): RunFailure | null {
  for (const point of Object.values(HookPoint)) {
    const support = prepared.hooks[point];
    const refused = support.state === SupportState.Unsupported || (prepared.strict && support.state !== SupportState.Supported);
    if (refused) {
      return { kind: "unsupported", message: EngineMessage.Unsupported, capability: point, engine: Engine.Sdk, why: supportWhy(support), support };
    }
  }
  return null;
}

export function checkStart<I extends string>(prepared: AgentPrepared<I>, start: AgentStart): RunFailure | null {
  const shape = startShape(start) ?? resumeShape(start) ?? portShape(start);
  if (shape !== null) {
    return shape;
  }
  for (const capability of startCells(start)) {
    const refused = cellGate(prepared.driver, capability, prepared.strict);
    if (refused !== null) {
      return refused;
    }
  }
  return start.hooks === undefined ? null : hookGate(prepared);
}

export async function checkDirs(fs: RuntimeFs, options: AgentOptions): Promise<RunFailure | null> {
  for (const [field, name] of DIR_FIELDS) {
    if (!(await fs.exists(options.dirs[name]))) {
      return invalid(AgentMessage.MissingDir, field);
    }
  }
  return null;
}
