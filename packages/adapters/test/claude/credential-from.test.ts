import { describe, expect, test } from "bun:test";
import { CredentialReason, CredentialUnsupportedReason } from "../../src/core/failure.ts";
import { secret } from "../../src/core/secret.ts";
import { credentialFromClaude } from "../../src/claude/credentials.ts";
import { claudePolicyNotice } from "../../src/claude/policy-notice.ts";
import { SENTINEL, failureOf, valueOf } from "../support/credential.ts";

describe("credentialFromClaude", () => {
  test("a non-object or non-string mode is invalid-config on the credential field", () => {
    for (const spec of [null, "api-key", [], { mode: 1 }, {}]) {
      const failure = failureOf(credentialFromClaude(spec));
      expect(failure).toMatchObject({ kind: "invalid-config", field: "credential" });
    }
  });

  test("an unlisted mode is credential-unsupported", () => {
    const failure = failureOf(credentialFromClaude({ mode: "bogus" }));
    expect(failure).toMatchObject({ kind: "credential-unsupported", mode: "bogus", reason: CredentialUnsupportedReason.UnknownMode });
  });

  test("api-key yields the secret key", () => {
    expect(valueOf(credentialFromClaude({ mode: "api-key", key: secret(SENTINEL) }))).toEqual({ mode: "api-key", key: expect.anything() });
  });

  test("api-key without a key is a missing-field credential failure", () => {
    expect(failureOf(credentialFromClaude({ mode: "api-key" }))).toMatchObject({ kind: "credential", reason: CredentialReason.MissingField, field: "key" });
  });

  test("login-store without acknowledgement fails with the policy notice", () => {
    const failure = failureOf(credentialFromClaude({ mode: "login-store" }));
    expect(failure).toMatchObject({ kind: "policy-not-acknowledged", notice: claudePolicyNotice("login-store") });
  });

  test("login-store with acknowledgement yields the acknowledged credential", () => {
    expect(valueOf(credentialFromClaude({ mode: "login-store", acknowledgePolicy: true }))).toEqual({ mode: "login-store", acknowledgePolicy: true });
  });

  test("token without acknowledgement fails with the policy notice", () => {
    expect(failureOf(credentialFromClaude({ mode: "token", token: secret(SENTINEL) }))).toMatchObject({ kind: "policy-not-acknowledged" });
  });

  test("token with acknowledgement yields the token and acknowledgement", () => {
    const value = valueOf(credentialFromClaude({ mode: "token", token: secret(SENTINEL), acknowledgePolicy: true }));
    expect(value).toMatchObject({ mode: "token", acknowledgePolicy: true });
  });

  test("cloud with a known selector yields the selector", () => {
    expect(valueOf(credentialFromClaude({ mode: "cloud", selector: "bedrock" }))).toEqual({ mode: "cloud", selector: "bedrock" });
  });

  test("cloud without a selector is a missing-field failure, and an unknown one is unknown-selector", () => {
    expect(failureOf(credentialFromClaude({ mode: "cloud" }))).toMatchObject({ kind: "credential", reason: CredentialReason.MissingField, field: "selector" });
    expect(failureOf(credentialFromClaude({ mode: "cloud", selector: "nowhere" }))).toMatchObject({ kind: "credential", reason: CredentialReason.UnknownSelector });
  });
});
