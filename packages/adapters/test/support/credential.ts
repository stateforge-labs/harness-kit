import type { RunFailure } from "../../src/core/failure.ts";
import type { CredentialPlanInput } from "../../src/core/credential-plan.ts";
import type { Result } from "../../src/core/result.ts";
import type { EnvSource } from "../../src/env.ts";

export const SENTINEL = "sk-SENTINEL-7f3a9c";
export const HOMES: readonly string[] = ["/h/a", "/root", "/home/x y"];

export function ambientEnv(names: readonly string[], home: string | null = "/h/u"): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of names) {
    env[name] = `AMBIENT-${name}`;
  }
  if (home !== null) {
    env.HOME = home;
  }
  return env;
}

export function planInput<I extends string>(credential: unknown, env: EnvSource): CredentialPlanInput<I> {
  return { credential, env } as unknown as CredentialPlanInput<I>;
}

export function valueOf<T>(result: Result<T, RunFailure>): T {
  if (!result.ok) {
    throw new Error(`expected ok, got ${result.failure.kind}`);
  }
  return result.value;
}

export function failureOf<T>(result: Result<T, RunFailure>): RunFailure {
  if (result.ok) {
    throw new Error("expected failure, got ok");
  }
  return result.failure;
}
