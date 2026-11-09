import { presentNames, type CredentialPlan } from "../core/credential-plan.ts";
import { isSecret, reveal } from "../core/secret.ts";
import type { EnvSource } from "../env.ts";

export interface ChildEnvInput {
  readonly base: EnvSource;
  readonly plan: CredentialPlan;
  readonly nestedEnv: readonly string[];
  readonly homeVar: string;
  readonly isolationDir: string | null;
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

export function probeEnv(base: EnvSource, strip: readonly string[], nestedEnv: readonly string[]): Record<string, string> {
  const env = definedCopy(base);
  removeNames(env, strip);
  removeNames(env, nestedEnv);
  return env;
}

export function buildChildEnv(input: ChildEnvInput): ChildEnv {
  const env = definedCopy(input.base);
  const scrubbed = presentNames(input.base, input.plan.strip);
  removeNames(env, input.plan.strip);

  const injected: string[] = [];
  const secrets: string[] = [];
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

  removeNames(env, input.nestedEnv);

  const set: string[] = [];
  if (input.isolationDir !== null) {
    env[input.homeVar] = input.isolationDir;
    set.push(input.homeVar);
  }

  return { env, secrets, scrubbed, injected, set };
}
