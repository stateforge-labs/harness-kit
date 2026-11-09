import { describe, expect, test } from "bun:test";
import { inspect } from "node:util";
import { OPENCODE_CREDENTIAL_VARS, openCodeCredentialPlan } from "../../src/opencode/credentials.ts";
import { reveal, secret, type Secret } from "../../src/core/secret.ts";
import { EnvVar } from "../../src/env.ts";
import { ambientEnv, failureOf, HOMES, SENTINEL, valueOf } from "../support/credential.ts";
import type { CredentialPlanInput } from "../../src/core/credential-plan.ts";
import type { EnvSource } from "../../src/env.ts";

function planInput(credential: unknown, env: EnvSource): CredentialPlanInput<"opencode"> {
  return { credential, env } as unknown as CredentialPlanInput<"opencode">;
}

function planFor(credential: unknown, home: string) {
  return valueOf(openCodeCredentialPlan(planInput(credential, ambientEnv(OPENCODE_CREDENTIAL_VARS, home))));
}

const PROVIDERS = [
  ["anthropic", EnvVar.AnthropicApiKey],
  ["openai", EnvVar.OpenAiApiKey],
  ["azure", EnvVar.AzureOpenAiApiKey],
  ["opencode", EnvVar.OpenCodeApiKey],
  ["amazon-bedrock", EnvVar.AwsBearerTokenBedrock],
] as const;

describe("opencode credential plan", () => {
  for (const home of HOMES) {
    for (const [provider, name] of PROVIDERS) {
      test(`api-key for ${provider} injects only ${name} under HOME=${home}`, () => {
        const plan = planFor({ mode: "api-key", provider, key: secret(SENTINEL) }, home);
        expect(Object.keys(plan.inject)).toEqual([name]);
        const injected = plan.inject[name];
        expect(typeof injected === "string" ? injected : reveal(injected as Secret)).toBe(SENTINEL);
        expect(plan.strip).toEqual(OPENCODE_CREDENTIAL_VARS);
        expect(plan.billing).toBe("per-token");
      });
    }

    test(`login-store injects nothing and strips every credential variable including OPENCODE_CONFIG_CONTENT under HOME=${home}`, () => {
      const plan = planFor({ mode: "login-store", provider: "anthropic" }, home);
      expect(plan.inject).toEqual({});
      expect(plan.strip).toEqual(OPENCODE_CREDENTIAL_VARS);
      expect(plan.strip).toContain(EnvVar.OpenCodeConfigContent);
      expect(plan.billing).toBe("unverified");
    });
  }

  test("login-store has no private-home refusal and no baseUrl is read", () => {
    const plan = planFor({ mode: "login-store", baseUrl: "https://example.invalid" }, "/h/u");
    expect(plan.inject).toEqual({});
    const keyed = planFor({ mode: "api-key", provider: "openai", key: secret(SENTINEL), baseUrl: "https://example.invalid" }, "/h/u");
    expect(Object.keys(keyed.inject)).toEqual([EnvVar.OpenAiApiKey]);
  });

  test("an unmeasured provider gives provider-unmeasured, including prototype keys", () => {
    for (const provider of ["mistral", "constructor", "__proto__", "toString"]) {
      expect(failureOf(openCodeCredentialPlan(planInput({ mode: "api-key", provider, key: secret(SENTINEL) }, ambientEnv([], "/h/u"))))).toMatchObject({
        kind: "credential",
        reason: "provider-unmeasured",
        field: "provider",
      });
    }
  });

  test("a missing or empty provider gives missing-field on provider", () => {
    for (const provider of [undefined, ""]) {
      expect(failureOf(openCodeCredentialPlan(planInput({ mode: "api-key", provider, key: secret(SENTINEL) }, ambientEnv([], "/h/u"))))).toMatchObject({
        kind: "credential",
        reason: "missing-field",
        field: "provider",
      });
    }
  });

  test("a missing key gives missing-field on key, an empty secret gives empty-secret", () => {
    expect(failureOf(openCodeCredentialPlan(planInput({ mode: "api-key", provider: "openai" }, ambientEnv([], "/h/u"))))).toMatchObject({
      kind: "credential",
      reason: "missing-field",
      field: "key",
    });
    expect(failureOf(openCodeCredentialPlan(planInput({ mode: "api-key", provider: "openai", key: secret("") }, ambientEnv([], "/h/u"))))).toMatchObject({
      kind: "credential",
      reason: "empty-secret",
    });
  });

  test("HOME unset gives home-unset and unknown modes are unsupported", () => {
    expect(failureOf(openCodeCredentialPlan(planInput({ mode: "api-key", provider: "openai", key: secret(SENTINEL) }, ambientEnv([], "")))).kind).toBe("credential");
    expect(failureOf(openCodeCredentialPlan(planInput({ mode: "token" }, ambientEnv([], "/h/u"))))).toMatchObject({
      kind: "credential-unsupported",
      reason: "unknown-mode",
    });
  });

  test("plans print without the sentinel", () => {
    const plan = planFor({ mode: "api-key", provider: "anthropic", key: secret(SENTINEL) }, "/h/u");
    expect(JSON.stringify(plan)).not.toContain(SENTINEL);
    expect(inspect(plan, { depth: 9 })).not.toContain(SENTINEL);
  });
});
