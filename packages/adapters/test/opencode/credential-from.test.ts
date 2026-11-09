import { describe, expect, test } from "bun:test";
import { CredentialReason, CredentialUnsupportedReason } from "../../src/core/failure.ts";
import { secret } from "../../src/core/secret.ts";
import { credentialFromOpencode } from "../../src/opencode/credentials.ts";
import { SENTINEL, failureOf, valueOf } from "../support/credential.ts";

describe("credentialFromOpencode", () => {
  test("a non-object spec is invalid-config on the credential field", () => {
    expect(failureOf(credentialFromOpencode(42))).toMatchObject({ kind: "invalid-config", field: "credential" });
  });

  test("cloud is not an OpenCode mode", () => {
    expect(failureOf(credentialFromOpencode({ mode: "cloud" }))).toMatchObject({ kind: "credential-unsupported", reason: CredentialUnsupportedReason.UnknownMode });
  });

  test("api-key needs a provider", () => {
    expect(failureOf(credentialFromOpencode({ mode: "api-key", key: secret(SENTINEL) }))).toMatchObject({ kind: "credential", reason: CredentialReason.MissingField, field: "provider" });
  });

  test("api-key with a key and provider yields both", () => {
    expect(valueOf(credentialFromOpencode({ mode: "api-key", key: secret(SENTINEL), provider: "openai" }))).toMatchObject({ mode: "api-key", provider: "openai" });
  });

  test("login-store without a provider yields the bare mode", () => {
    expect(valueOf(credentialFromOpencode({ mode: "login-store" }))).toEqual({ mode: "login-store" });
  });
});
