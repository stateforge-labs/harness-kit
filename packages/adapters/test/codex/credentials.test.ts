import { describe, expect, test } from "bun:test";
import { inspect } from "node:util";
import { CODEX_CREDENTIAL_VARS, codexCredentialPlan } from "../../src/codex/credentials.ts";
import { buildChildEnv, inheritEnv } from "../../src/driver/env-plan.ts";
import { secret } from "../../src/core/secret.ts";
import { EnvVar } from "../../src/env.ts";
import type { IsolationSpec } from "../../src/core/run.ts";
import { ambientEnv, failureOf, HOMES, planInput, SENTINEL, valueOf } from "../support/credential.ts";

const NONE: IsolationSpec = { kind: "none" };

function childFor(credential: unknown, home: string) {
  const base = ambientEnv(CODEX_CREDENTIAL_VARS, home);
  const plan = valueOf(codexCredentialPlan(planInput<"codex">(credential, NONE, base)));
  const child = buildChildEnv({ base: inheritEnv(base), plan, nestedEnv: [], homeVar: EnvVar.CodexHome, isolationDir: null });
  return { base, plan, child };
}

describe("codex credential plan", () => {
  for (const home of HOMES) {
    test(`api-key injects only CODEX_API_KEY under HOME=${home}`, () => {
      const { child, plan } = childFor({ mode: "api-key", key: secret(SENTINEL) }, home);
      expect(child.env[EnvVar.CodexApiKey]).toBe(SENTINEL);
      expect(child.env[EnvVar.OpenAiApiKey]).toBeUndefined();
      expect(child.injected).toEqual([EnvVar.CodexApiKey]);
      expect(child.secrets).toEqual([SENTINEL]);
      expect(child.scrubbed).toEqual(CODEX_CREDENTIAL_VARS);
      expect(plan.billing).toBe("per-token");
      expect(plan.acknowledgement).toBeNull();
    });

    test(`login-store strips OPENAI_API_KEY and CODEX_API_KEY under HOME=${home}`, () => {
      const { child, plan } = childFor({ mode: "login-store" }, home);
      expect(child.env[EnvVar.OpenAiApiKey]).toBeUndefined();
      expect(child.env[EnvVar.CodexApiKey]).toBeUndefined();
      expect(child.injected).toEqual([]);
      expect(child.scrubbed).toEqual(CODEX_CREDENTIAL_VARS);
      expect(plan.billing).toBe("unverified");
      expect(plan.acknowledgement).toBeNull();
    });
  }

  test("token is not offered by codex", () => {
    expect(failureOf(codexCredentialPlan(planInput<"codex">({ mode: "token", token: secret(SENTINEL) }, NONE, ambientEnv([], "/h/u"))))).toMatchObject({
      kind: "credential-unsupported",
      reason: "unknown-mode",
    });
  });

  test("HOME unset gives home-unset", () => {
    expect(failureOf(codexCredentialPlan(planInput<"codex">({ mode: "api-key", key: secret(SENTINEL) }, NONE, ambientEnv([], null))))).toMatchObject({
      kind: "credential",
      reason: "home-unset",
      field: "HOME",
    });
  });

  test("a plain string key gives not-a-secret, and an empty secret gives empty-secret", () => {
    expect(failureOf(codexCredentialPlan(planInput<"codex">({ mode: "api-key", key: SENTINEL }, NONE, ambientEnv([], "/h/u"))))).toMatchObject({
      kind: "credential",
      reason: "not-a-secret",
      field: "key",
    });
    expect(failureOf(codexCredentialPlan(planInput<"codex">({ mode: "api-key", key: secret("") }, NONE, ambientEnv([], "/h/u"))))).toMatchObject({
      kind: "credential",
      reason: "empty-secret",
    });
  });

  test("plans print without the sentinel", () => {
    const { plan } = childFor({ mode: "api-key", key: secret(SENTINEL) }, "/h/u");
    expect(JSON.stringify(plan)).not.toContain(SENTINEL);
    expect(inspect(plan, { depth: 9 })).not.toContain(SENTINEL);
  });
});
