import { presentNames, type CredentialPlan } from "../core/credential-plan.ts";
import type { RunFailure } from "../core/failure.ts";
import { EnvKind, type EnvPolicy } from "../core/policy.ts";
import { fail, ok, type Result } from "../core/result.ts";
import { isSecret, reveal } from "../core/secret.ts";
import { EnvVar, type EnvSource } from "../env.ts";
import { captureThrow } from "./execute.ts";
import { envFailure, envPathFailure } from "./finish.ts";

export interface EnvBase {
  readonly kind: "inherit" | "closed";
  readonly env: Readonly<Record<string, string>>;
  readonly secrets: readonly string[];
  readonly set: readonly string[];
}

export interface ChildEnvInput {
  readonly base: EnvBase;
  readonly plan: CredentialPlan;
  readonly nestedEnv: readonly string[];
}

export interface ChildEnv {
  readonly env: Record<string, string>;
  readonly secrets: readonly string[];
  readonly scrubbed: readonly string[];
  readonly injected: readonly string[];
  readonly set: readonly string[];
}

function definedCopy(source: EnvSource): Record<string, string> {
  const copy: Record<string, string> = {};
  for (const [name, value] of Object.entries(source)) {
    if (value !== undefined) {
      copy[name] = value;
    }
  }
  return copy;
}

function removeNames(env: Record<string, string>, names: readonly string[]): void {
  for (const name of names) {
    delete env[name];
  }
}

function stringsOnly(value: unknown): Result<Record<string, string>, RunFailure> {
  if (typeof value !== "object" || value === null) {
    return fail(envFailure());
  }
  const out: Record<string, string> = {};
  for (const [name, item] of Object.entries(value)) {
    if (item === undefined) {
      continue;
    }
    if (typeof item !== "string") {
      return fail(envFailure());
    }
    out[name] = item;
  }
  return ok(out);
}

export function inheritEnv(source: EnvSource): EnvBase {
  return { kind: EnvKind.Inherit, env: definedCopy(source), secrets: [], set: [] };
}

function inheritBase(base: EnvSource, transform: ((env: EnvSource) => EnvSource) | undefined): Result<EnvBase, RunFailure> {
  const copy = definedCopy(base);
  if (transform === undefined) {
    return ok(inheritEnv(base));
  }
  const captured = captureThrow(() => transform({ ...copy }));
  if (!captured.ok) {
    return fail(envFailure());
  }
  const changed = stringsOnly(captured.value);
  return changed.ok ? ok({ kind: EnvKind.Inherit, env: changed.value, secrets: [], set: [] }) : fail(changed.failure);
}

function closedBase(set: Readonly<Record<string, unknown>>, quiet: Readonly<Record<string, string>> | null): Result<EnvBase, RunFailure> {
  if (!Object.hasOwn(set, EnvVar.Path)) {
    return fail(envPathFailure());
  }
  const env: Record<string, string> = { ...(quiet ?? {}) };
  const secrets: string[] = [];
  for (const [name, value] of Object.entries(set)) {
    if (isSecret(value)) {
      const raw = reveal(value);
      env[name] = raw;
      secrets.push(raw);
    } else if (typeof value === "string") {
      env[name] = value;
    } else {
      return fail(envFailure());
    }
  }
  return ok({ kind: EnvKind.Closed, env, secrets, set: Object.keys(env) });
}

export function baseEnv(source: EnvSource, policy: EnvPolicy, quiet: Readonly<Record<string, string>> | null): Result<EnvBase, RunFailure> {
  return policy.kind === EnvKind.Closed ? closedBase(policy.set, policy.quiet === true ? quiet : null) : inheritBase(source, policy.transform);
}

export function probeEnv(base: EnvSource, strip: readonly string[], nestedEnv: readonly string[]): Record<string, string> {
  const env = definedCopy(base);
  removeNames(env, strip);
  removeNames(env, nestedEnv);
  return env;
}

export function buildChildEnv(input: ChildEnvInput): ChildEnv {
  const env = { ...input.base.env };
  const inherit = input.base.kind === EnvKind.Inherit;
  const scrubbed = inherit ? presentNames(input.base.env, input.plan.strip) : [];
  if (inherit) {
    removeNames(env, input.plan.strip);
  }

  const injected: string[] = [];
  const secrets: string[] = [...input.base.secrets];
  for (const [name, value] of Object.entries(input.plan.inject)) {
    if (isSecret(value)) {
      const raw = reveal(value);
      env[name] = raw;
      secrets.push(raw);
    } else {
      env[name] = value;
    }
    injected.push(name);
  }

  if (inherit) {
    removeNames(env, input.nestedEnv);
  }

  const set: string[] = [...input.base.set];

  return { env, secrets, scrubbed, injected, set };
}

export function mergeInvocationEnv(env: Readonly<Record<string, string>>, own: Readonly<Record<string, string>> | undefined, injected: readonly string[]): Record<string, string> {
  const merged: Record<string, string> = { ...env };
  for (const [name, value] of Object.entries(own ?? {})) {
    if (!injected.includes(name)) {
      merged[name] = value;
    }
  }
  return merged;
}
