import { describe, expect, test } from "bun:test";
import { CredentialReason, CredentialUnsupportedReason } from "../../src/core/failure.ts";
import { secret } from "../../src/core/secret.ts";
import { credentialFromCodex } from "../../src/codex/credentials.ts";
import { SENTINEL, failureOf, valueOf } from "../support/credential.ts";

describe("credentialFromCodex", () => {
  test("a non-object spec is invalid-config on the credential field", () => {
    expect(failureOf(credentialFromCodex("api-key"))).toMatchObject({ kind: "invalid-config", field: "credential" });
  });

  test("cloud is not a Codex mode", () => {
    expect(failureOf(credentialFromCodex({ mode: "cloud" }))).toMatchObject({ kind: "credential-unsupported", reason: CredentialUnsupportedReason.UnknownMode });
  });

  test("api-key yields the secret key", () => {
    expect(valueOf(credentialFromCodex({ mode: "api-key", key: secret(SENTINEL) }))).toMatchObject({ mode: "api-key" });
  });

  test("api-key without a key is a missing-field failure", () => {
    expect(failureOf(credentialFromCodex({ mode: "api-key" }))).toMatchObject({ kind: "credential", reason: CredentialReason.MissingField });
  });

  test("login-store needs no acknowledgement", () => {
    expect(valueOf(credentialFromCodex({ mode: "login-store" }))).toEqual({ mode: "login-store" });
  });
});
