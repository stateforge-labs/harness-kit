import { Engine } from "../core/capability.ts";
import type { RunFailure } from "../core/failure.ts";
import { fail, ok, type Result } from "../core/result.ts";
import { Hermetic, Isolation, type Effort, type HeadlessOptions, type IsolationSpec, type Limits, type RunRequest } from "../core/run.ts";
import { ConfigField, ConfigMessage, DEFAULT_LIMITS, DEFAULT_PERSIST, Layer } from "./constants.ts";

export interface Picked<T> {
  readonly value: T;
  readonly layer: Layer;
}

export interface Merged {
  readonly model: string | null;
  readonly effort: Effort | null;
  readonly hermetic: Hermetic;
  readonly persist: boolean;
  readonly maxArgvBytes: number | null;
  readonly timeoutMs: number | null;
  readonly cwd: string;
  readonly isolation: IsolationSpec;
  readonly signal: AbortSignal | null;
  readonly limits: Limits;
  readonly acceptVersions: readonly string[] | null;
  readonly layers: Readonly<Record<string, Layer>>;
}

const NO_ISOLATION: IsolationSpec = { kind: Isolation.None };

export function pick<T>(call: T | undefined, consumer: T | undefined, fact: T): Picked<T> {
  if (call !== undefined) {
    return { value: call, layer: Layer.Call };
  }
  if (consumer !== undefined) {
    return { value: consumer, layer: Layer.Consumer };
  }
  return { value: fact, layer: Layer.Fact };
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

function limitsOf(picked: Picked<Partial<Limits>>): Result<Limits, RunFailure> {
  const { maxStdoutBytes, maxStderrBytes } = picked.value;
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
  return options.engine === undefined || options.engine === Engine.Cli ? null : invalidConfig(ConfigField.Engine, ConfigMessage.CliOnly);
}

function checkCwd(cwd: unknown): RunFailure | null {
  return typeof cwd === "string" ? null : invalidConfig(ConfigField.Cwd, ConfigMessage.Text);
}

export function mergeOptions<I extends string>(options: HeadlessOptions<I>, request: RunRequest, cwd: string): Result<Merged, RunFailure> {
  const timeout = pick<number | null>(request.timeoutMs, options.timeoutMs, null);
  const maxArgv = pick<number | null>(request.maxArgvBytes, options.maxArgvBytes, null);
  const model = pick<string | null>(request.model, options.model, null);
  const failure =
    checkPositive(timeout.value, ConfigField.TimeoutMs) ??
    checkPositive(maxArgv.value, ConfigField.MaxArgvBytes) ??
    checkModel(model.value) ??
    checkRequest(request) ??
    checkConsumer(options);
  if (failure !== null) {
    return fail(failure);
  }
  const limitsPick = pick<Partial<Limits>>(request.limits, options.limits, {});
  const limits = limitsOf(limitsPick);
  if (!limits.ok) {
    return fail(limits.failure);
  }
  const workdir = pick<string>(request.cwd, options.cwd, cwd);
  const cwdFailure = checkCwd(workdir.value);
  if (cwdFailure !== null) {
    return fail(cwdFailure);
  }
  const effort = pick<Effort | null>(request.effort, options.effort, null);
  const hermetic = pick<Hermetic>(request.hermetic, options.hermetic, Hermetic.None);
  const persist = pick<boolean>(request.persist, options.persist, DEFAULT_PERSIST);
  const signal = pick<AbortSignal | null>(request.signal, options.signal, null);
  const isolation = pick<IsolationSpec>(undefined, options.isolation, NO_ISOLATION);
  const acceptVersions = pick<readonly string[] | null>(undefined, options.acceptVersions, null);
  return ok({
    model: model.value,
    effort: effort.value,
    hermetic: hermetic.value,
    persist: persist.value,
    maxArgvBytes: maxArgv.value,
    timeoutMs: timeout.value,
    cwd: workdir.value,
    isolation: isolation.value,
    signal: signal.value,
    limits: limits.value,
    acceptVersions: acceptVersions.value,
    layers: {
      [ConfigField.Model]: model.layer,
      [ConfigField.Effort]: effort.layer,
      [ConfigField.TimeoutMs]: timeout.layer,
      [ConfigField.Cwd]: workdir.layer,
      [ConfigField.MaxArgvBytes]: maxArgv.layer,
      [ConfigField.Limits]: limitsPick.layer,
      hermetic: hermetic.layer,
      persist: persist.layer,
      signal: signal.layer,
      isolation: isolation.layer,
      acceptVersions: acceptVersions.layer,
    },
  });
}
