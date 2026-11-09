import { Engine } from "../core/capability.ts";
import type { RunFailure } from "../core/failure.ts";
import { fail, ok, type Result } from "../core/result.ts";
import { DEFAULT_ENV, EnvKind, resolveTools, type EnvPolicy, type ResolvedTools } from "../core/policy.ts";
import type { CwdSpec, Effort, HeadlessOptions, Limits, RunRequest } from "../core/run.ts";
import { ConfigField, ConfigMessage, DEFAULT_LIMITS, DEFAULT_PERSIST, PrivateCwd } from "./constants.ts";

export interface Merged {
  readonly model: string | null;
  readonly effort: Effort | null;
  readonly persist: boolean;
  readonly maxArgvBytes: number | null;
  readonly timeoutMs: number | null;
  readonly cwd: string;
  readonly privateCwd: "delete" | "keep" | null;
  readonly engine: Engine;
  readonly tools: ResolvedTools;
  readonly env: EnvPolicy;
  readonly signal: AbortSignal | null;
  readonly limits: Limits;
}

export function pick<T>(call: T | undefined, consumer: T | undefined, fact: T): T {
  if (call !== undefined) {
    return call;
  }
  return consumer !== undefined ? consumer : fact;
}

export function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function invalidConfig(field: string, constant: string): RunFailure {
  return { kind: "invalid-config", message: `${field} ${constant}`, field };
}

function clampLimit(given: number | undefined, fallback: number): number {
  return given === undefined ? fallback : Math.min(given, fallback);
}

function limitsOf(picked: Partial<Limits>): Result<Limits, RunFailure> {
  const { maxStdoutBytes, maxStderrBytes } = picked;
  const bad = [maxStdoutBytes, maxStderrBytes].some((value) => value !== undefined && !isPositiveInteger(value));
  if (bad) {
    return fail(invalidConfig(ConfigField.Limits, ConfigMessage.Positive));
  }
  return ok({
    maxStdoutBytes: clampLimit(maxStdoutBytes, DEFAULT_LIMITS.maxStdoutBytes),
    maxStderrBytes: clampLimit(maxStderrBytes, DEFAULT_LIMITS.maxStderrBytes),
  });
}

function checkPositive(value: number | null, field: string): RunFailure | null {
  return value === null || isPositiveInteger(value) ? null : invalidConfig(field, ConfigMessage.Positive);
}

function checkModel(model: string | null): RunFailure | null {
  if (model === null) {
    return null;
  }
  return typeof model === "string" && model !== "" ? null : invalidConfig(ConfigField.Model, ConfigMessage.NonEmpty);
}

function checkRequest(request: RunRequest): RunFailure | null {
  if (typeof request.instructions !== "string") {
    return invalidConfig(ConfigField.Instructions, ConfigMessage.Text);
  }
  return typeof request.input === "string" && request.input !== "" ? null : invalidConfig(ConfigField.Input, ConfigMessage.NonEmpty);
}

function checkConsumer<I extends string>(options: HeadlessOptions<I>): RunFailure | null {
  if (options.credential === undefined || options.credential === null) {
    return invalidConfig(ConfigField.Credential, ConfigMessage.Required);
  }
  return options.engine === undefined || Object.values<string>(Engine).includes(options.engine) ? null : invalidConfig(ConfigField.Engine, ConfigMessage.KnownEngine);
}

function privateOf(cwd: CwdSpec): "delete" | "keep" | null {
  if (typeof cwd === "string") {
    return null;
  }
  return cwd.private === PrivateCwd.Keep ? PrivateCwd.Keep : PrivateCwd.Delete;
}

function checkCwd(cwd: unknown): RunFailure | null {
  if (typeof cwd === "string") {
    return null;
  }
  const retain = typeof cwd === "object" && cwd !== null ? (cwd as { readonly private?: unknown }).private : undefined;
  return retain === PrivateCwd.Delete || retain === PrivateCwd.Keep ? null : invalidConfig(ConfigField.Cwd, ConfigMessage.CwdSpec);
}

function checkEnv(env: EnvPolicy): RunFailure | null {
  if (typeof env !== "object" || env === null) {
    return invalidConfig(ConfigField.Env, ConfigMessage.EnvPolicy);
  }
  if (env.kind === EnvKind.Inherit) {
    return env.transform === undefined || typeof env.transform === "function" ? null : invalidConfig(ConfigField.Env, ConfigMessage.EnvPolicy);
  }
  return env.kind === EnvKind.Closed && typeof env.set === "object" && env.set !== null ? null : invalidConfig(ConfigField.Env, ConfigMessage.EnvPolicy);
}

export function mergeOptions<I extends string>(options: HeadlessOptions<I>, request: RunRequest, cwd: string): Result<Merged, RunFailure> {
  const timeout = pick<number | null>(request.timeoutMs, options.timeoutMs, null);
  const maxArgv = pick<number | null>(request.maxArgvBytes, options.maxArgvBytes, null);
  const model = pick<string | null>(request.model, options.model, null);
  const failure =
    checkPositive(timeout, ConfigField.TimeoutMs) ??
    checkPositive(maxArgv, ConfigField.MaxArgvBytes) ??
    checkModel(model) ??
    checkRequest(request) ??
    checkConsumer(options);
  if (failure !== null) {
    return fail(failure);
  }
  const limits = limitsOf(pick<Partial<Limits>>(request.limits, options.limits, {}));
  if (!limits.ok) {
    return fail(limits.failure);
  }
  const workdir = pick<CwdSpec>(request.cwd, options.cwd, cwd);
  const cwdFailure = checkCwd(workdir);
  if (cwdFailure !== null) {
    return fail(cwdFailure);
  }
  const envPolicy = pick<EnvPolicy>(request.env, options.env, DEFAULT_ENV);
  const envFailure = checkEnv(envPolicy);
  if (envFailure !== null) {
    return fail(envFailure);
  }
  const effort = pick<Effort | null>(request.effort, options.effort, null);
  const tools = resolveTools(request.tools, options.tools);
  const persist = pick<boolean>(request.persist, options.persist, DEFAULT_PERSIST);
  const signal = pick<AbortSignal | null>(request.signal, options.signal, null);
  return ok({
    model,
    effort,
    persist,
    maxArgvBytes: maxArgv,
    timeoutMs: timeout,
    cwd: typeof workdir === "string" ? workdir : cwd,
    privateCwd: privateOf(workdir),
    engine: options.engine ?? Engine.Cli,
    tools,
    env: envPolicy,
    signal,
    limits: limits.value,
  });
}
