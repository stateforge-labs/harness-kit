import { describe, expect, test } from "bun:test";
import { inspect } from "node:util";
import { CLAUDE_CREDENTIAL_VARS, claudeCredentialPlan } from "../../src/claude/credentials.ts";
import { CLAUDE_NESTED_ENV } from "../../src/claude/launch.ts";
import { buildChildEnv } from "../../src/driver/env-plan.ts";
import { secret } from "../../src/core/secret.ts";
import { EnvVar } from "../../src/env.ts";
import { Isolation, type IsolationSpec } from "../../src/core/run.ts";
import { ambientEnv, failureOf, HOMES, planInput, SENTINEL, valueOf } from "../support/credential.ts";

const NONE: IsolationSpec = { kind: "none" };
const PRIVATE: IsolationSpec = { kind: "private-home", retain: "delete" };
const ACK = { acknowledgePolicy: true };

function childFor(credential: unknown, home: string, isolation: IsolationSpec = NONE, isolationDir: string | null = null) {
  const base = ambientEnv(CLAUDE_CREDENTIAL_VARS, home);
  const plan = valueOf(claudeCredentialPlan(planInput<"claude">(credential, isolation, base)));
  const child = buildChildEnv({ base, plan, nestedEnv: CLAUDE_NESTED_ENV, homeVar: EnvVar.ClaudeConfigDir, isolationDir });
  return { base, plan, child };
}

describe("claude credential plan, per home", () => {
  for (const home of HOMES) {
    test(`api-key injects only ANTHROPIC_API_KEY under HOME=${home}`, () => {
      const { child, plan } = childFor({ mode: "api-key", key: secret(SENTINEL) }, home);
      expect(child.env[EnvVar.AnthropicApiKey]).toBe(SENTINEL);
      for (const name of CLAUDE_CREDENTIAL_VARS) {
        if (name !== EnvVar.AnthropicApiKey) {
          expect(child.env[name]).toBeUndefined();
        }
      }
      expect(child.env.HOME).toBe(home);
      expect(child.injected).toEqual([EnvVar.AnthropicApiKey]);
      expect(child.secrets).toEqual([SENTINEL]);
      expect(child.scrubbed).toEqual(CLAUDE_CREDENTIAL_VARS);
      expect(child.set).toEqual([]);
      expect(plan.billing).toBe("per-token");
      expect(plan.acknowledgement).toBeNull();
    });

    test(`token injects only CLAUDE_CODE_OAUTH_TOKEN under HOME=${home}`, () => {
      const { child, plan } = childFor({ mode: "token", token: secret(SENTINEL), ...ACK }, home);
      expect(child.env[EnvVar.ClaudeCodeOauthToken]).toBe(SENTINEL);
      expect(child.env[EnvVar.AnthropicApiKey]).toBeUndefined();
      expect(child.injected).toEqual([EnvVar.ClaudeCodeOauthToken]);
      expect(child.secrets).toEqual([SENTINEL]);
      expect(plan.billing).toBe("unverified");
      expect(plan.acknowledgement).toEqual({ noticeRetrievedAt: "2026-11-09" });
    });

    test(`login-store injects nothing and strips every credential variable under HOME=${home}`, () => {
      const { child, plan } = childFor({ mode: "login-store", ...ACK }, home);
      for (const name of CLAUDE_CREDENTIAL_VARS) {
        expect(child.env[name]).toBeUndefined();
      }
      expect(child.injected).toEqual([]);
      expect(child.secrets).toEqual([]);
      expect(child.scrubbed).toEqual(CLAUDE_CREDENTIAL_VARS);
      expect(plan.billing).toBe("unverified");
      expect(plan.acknowledgement).toEqual({ noticeRetrievedAt: "2026-11-09" });
    });

    for (const [selector, name] of [
      ["bedrock", EnvVar.ClaudeCodeUseBedrock],
      ["vertex", EnvVar.ClaudeCodeUseVertex],
      ["foundry", EnvVar.ClaudeCodeUseFoundry],
    ] as const) {
      test(`cloud ${selector} sets ${name}=1 under HOME=${home}`, () => {
        const { child } = childFor({ mode: "cloud", selector }, home);
        expect(child.env[name]).toBe("1");
        expect(child.injected).toEqual([name]);
        expect(child.secrets).toEqual([]);
        expect(child.scrubbed).toEqual(CLAUDE_CREDENTIAL_VARS);
      });
    }
  }
});

describe("claude isolation matrix", () => {
  test("api-key, token and cloud are allowed with a private home", () => {
    expect(valueOf(claudeCredentialPlan(planInput<"claude">({ mode: "api-key", key: secret(SENTINEL) }, PRIVATE, ambientEnv([], "/h/u")))).mode).toBe("api-key");
    expect(valueOf(claudeCredentialPlan(planInput<"claude">({ mode: "token", token: secret(SENTINEL), ...ACK }, PRIVATE, ambientEnv([], "/h/u")))).mode).toBe("token");
    expect(valueOf(claudeCredentialPlan(planInput<"claude">({ mode: "cloud", selector: "bedrock" }, PRIVATE, ambientEnv([], "/h/u")))).mode).toBe("cloud");
  });

  test("login-store with a private home is credential-unsupported", () => {
    const failure = failureOf(claudeCredentialPlan(planInput<"claude">({ mode: "login-store", ...ACK }, PRIVATE, ambientEnv([], "/h/u"))));
    expect(failure).toMatchObject({ kind: "credential-unsupported", reason: "private-home-moves-login", mode: "login-store" });
  });

  test("the private home variable is set only when a directory is given", () => {
    const { child } = childFor({ mode: "api-key", key: secret(SENTINEL) }, "/h/u", PRIVATE, "/iso/dir");
    expect(child.env[EnvVar.ClaudeConfigDir]).toBe("/iso/dir");
    expect(child.set).toEqual([EnvVar.ClaudeConfigDir]);
  });
});

describe("claude failures", () => {
  const base = ambientEnv(CLAUDE_CREDENTIAL_VARS);

  test("HOME unset and empty both give home-unset on HOME", () => {
    for (const home of [null, ""]) {
      const env = ambientEnv(CLAUDE_CREDENTIAL_VARS, home);
      expect(failureOf(claudeCredentialPlan(planInput<"claude">({ mode: "api-key", key: secret(SENTINEL) }, NONE, env)))).toMatchObject({
        kind: "credential",
        reason: "home-unset",
        field: "HOME",
      });
    }
  });

  test("a plain string key gives not-a-secret on key", () => {
    expect(failureOf(claudeCredentialPlan(planInput<"claude">({ mode: "api-key", key: SENTINEL }, NONE, base)))).toMatchObject({
      kind: "credential",
      reason: "not-a-secret",
      field: "key",
    });
  });

  test("a plain string token gives not-a-secret on token", () => {
    expect(failureOf(claudeCredentialPlan(planInput<"claude">({ mode: "token", token: SENTINEL, ...ACK }, NONE, base)))).toMatchObject({
      kind: "credential",
      reason: "not-a-secret",
      field: "token",
    });
  });

  test("a missing key gives missing-field on key", () => {
    expect(failureOf(claudeCredentialPlan(planInput<"claude">({ mode: "api-key" }, NONE, base)))).toMatchObject({
      kind: "credential",
      reason: "missing-field",
      field: "key",
    });
  });

  test("an empty secret gives empty-secret", () => {
    expect(failureOf(claudeCredentialPlan(planInput<"claude">({ mode: "api-key", key: secret("") }, NONE, base)))).toMatchObject({
      kind: "credential",
      reason: "empty-secret",
      field: "key",
    });
  });

  test("an unknown mode gives credential-unsupported unknown-mode", () => {
    expect(failureOf(claudeCredentialPlan(planInput<"claude">({ mode: "bogus" }, NONE, base)))).toMatchObject({
      kind: "credential-unsupported",
      reason: "unknown-mode",
      mode: "bogus",
    });
  });

  for (const selector of ["azure", "constructor", "__proto__", "", undefined]) {
    test(`cloud selector ${JSON.stringify(selector)} gives unknown-selector`, () => {
      expect(failureOf(claudeCredentialPlan(planInput<"claude">({ mode: "cloud", selector }, NONE, base)))).toMatchObject({
        kind: "credential",
        reason: "unknown-selector",
        field: "selector",
      });
    });
  }

  for (const mode of ["login-store", "token"]) {
    const cases: readonly { readonly label: string; readonly extra: Record<string, unknown> }[] = [
      { label: "acknowledgePolicy false", extra: { acknowledgePolicy: false } },
      { label: "acknowledgePolicy string true", extra: { acknowledgePolicy: "true" } },
      { label: "acknowledgePolicy absent", extra: {} },
    ];
    for (const { label, extra } of cases) {
      test(`${mode} with ${label} gives policy-not-acknowledged`, () => {
        const credential = mode === "token" ? { mode, token: secret(SENTINEL), ...extra } : { mode, ...extra };
        const failure = failureOf(claudeCredentialPlan(planInput<"claude">(credential, NONE, base)));
        expect(failure.kind).toBe("policy-not-acknowledged");
        if (failure.kind === "policy-not-acknowledged") {
          expect<string>(failure.notice.mode).toBe(mode);
          expect(failure.notice.harness).toBe("claude");
        }
      });
    }
  }
});

describe("claude plans never carry the raw value", () => {
  test("plan and failures print without the sentinel", () => {
    const { plan } = childFor({ mode: "api-key", key: secret(SENTINEL) }, "/h/u");
    expect(JSON.stringify(plan)).not.toContain(SENTINEL);
    expect(inspect(plan, { depth: 9 })).not.toContain(SENTINEL);
    const failure = failureOf(claudeCredentialPlan(planInput<"claude">({ mode: "api-key", key: secret("") }, NONE, ambientEnv([], "/h/u"))));
    expect(JSON.stringify(failure)).not.toContain(SENTINEL);
  });
});
