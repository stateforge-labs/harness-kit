import { describe, expect, test } from "bun:test";
import { inspect } from "node:util";
import { OPENCODE_CREDENTIAL_VARS, openCodeCredentialPlan } from "../../src/opencode/credentials.ts";
import { buildChildEnv, inheritEnv } from "../../src/driver/env-plan.ts";
import { secret } from "../../src/core/secret.ts";
import { EnvVar } from "../../src/env.ts";
import type { IsolationSpec } from "../../src/core/run.ts";
import { ambientEnv, failureOf, HOMES, planInput, SENTINEL, valueOf } from "../support/credential.ts";

const NONE: IsolationSpec = { kind: "none" };
const PRIVATE: IsolationSpec = { kind: "private-home", retain: "delete" };

function childFor(credential: unknown, home: string, isolation: IsolationSpec = NONE, isolationDir: string | null = null) {
  const base = ambientEnv(OPENCODE_CREDENTIAL_VARS, home);
  const plan = valueOf(openCodeCredentialPlan(planInput<"opencode">(credential, isolation, base)));
  const child = buildChildEnv({ base: inheritEnv(base), plan, nestedEnv: [], homeVar: EnvVar.XdgDataHome, isolationDir });
  return { base, plan, child };
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
        const { child, plan } = childFor({ mode: "api-key", provider, key: secret(SENTINEL) }, home);
        expect(child.env[name]).toBe(SENTINEL);
        for (const other of OPENCODE_CREDENTIAL_VARS) {
          if (other !== name) {
            expect(child.env[other]).toBeUndefined();
          }
        }
        expect(child.injected).toEqual([name]);
        expect(child.secrets).toEqual([SENTINEL]);
        expect(child.scrubbed).toEqual(OPENCODE_CREDENTIAL_VARS);
        expect(plan.billing).toBe("per-token");
      });
    }

    test(`login-store strips every credential variable including OPENCODE_CONFIG_CONTENT under HOME=${home}`, () => {
      const { child, plan } = childFor({ mode: "login-store", provider: "anthropic" }, home);
      for (const name of OPENCODE_CREDENTIAL_VARS) {
        expect(child.env[name]).toBeUndefined();
      }
      expect(child.env[EnvVar.OpenCodeConfigContent]).toBeUndefined();
      expect(child.injected).toEqual([]);
      expect(child.scrubbed).toEqual(OPENCODE_CREDENTIAL_VARS);
      expect(plan.billing).toBe("unverified");
    });
  }

  test("login-store with a private home is credential-unsupported", () => {
    const failure = failureOf(openCodeCredentialPlan(planInput<"opencode">({ mode: "login-store" }, PRIVATE, ambientEnv([], "/h/u"))));
    expect(failure).toMatchObject({ kind: "credential-unsupported", reason: "private-home-no-auth-copy", mode: "login-store" });
  });

  test("api-key with a private home sets XDG_DATA_HOME to the directory", () => {
    const { child } = childFor({ mode: "api-key", provider: "openai", key: secret(SENTINEL) }, "/h/u", PRIVATE, "/iso/xdg");
    expect(child.env[EnvVar.XdgDataHome]).toBe("/iso/xdg");
    expect(child.set).toEqual([EnvVar.XdgDataHome]);
  });

  test("an unmeasured provider gives provider-unmeasured, including prototype keys", () => {
    for (const provider of ["mistral", "constructor", "__proto__", "toString"]) {
      expect(failureOf(openCodeCredentialPlan(planInput<"opencode">({ mode: "api-key", provider, key: secret(SENTINEL) }, NONE, ambientEnv([], "/h/u"))))).toMatchObject({
        kind: "credential",
        reason: "provider-unmeasured",
        field: "provider",
      });
    }
  });

  test("a missing or empty provider gives missing-field on provider", () => {
    for (const provider of [undefined, ""]) {
      expect(failureOf(openCodeCredentialPlan(planInput<"opencode">({ mode: "api-key", provider, key: secret(SENTINEL) }, NONE, ambientEnv([], "/h/u"))))).toMatchObject({
        kind: "credential",
        reason: "missing-field",
        field: "provider",
      });
    }
  });

  test("a missing key gives missing-field on key, an empty secret gives empty-secret", () => {
    expect(failureOf(openCodeCredentialPlan(planInput<"opencode">({ mode: "api-key", provider: "openai" }, NONE, ambientEnv([], "/h/u"))))).toMatchObject({
      kind: "credential",
      reason: "missing-field",
      field: "key",
    });
    expect(failureOf(openCodeCredentialPlan(planInput<"opencode">({ mode: "api-key", provider: "openai", key: secret("") }, NONE, ambientEnv([], "/h/u"))))).toMatchObject({
      kind: "credential",
      reason: "empty-secret",
    });
  });

  test("HOME unset gives home-unset and unknown modes are unsupported", () => {
    expect(failureOf(openCodeCredentialPlan(planInput<"opencode">({ mode: "api-key", provider: "openai", key: secret(SENTINEL) }, NONE, ambientEnv([], "")))).kind).toBe("credential");
    expect(failureOf(openCodeCredentialPlan(planInput<"opencode">({ mode: "token" }, NONE, ambientEnv([], "/h/u"))))).toMatchObject({
      kind: "credential-unsupported",
      reason: "unknown-mode",
    });
  });

  test("plans print without the sentinel", () => {
    const { plan } = childFor({ mode: "api-key", provider: "anthropic", key: secret(SENTINEL) }, "/h/u");
    expect(JSON.stringify(plan)).not.toContain(SENTINEL);
    expect(inspect(plan, { depth: 9 })).not.toContain(SENTINEL);
  });
});
