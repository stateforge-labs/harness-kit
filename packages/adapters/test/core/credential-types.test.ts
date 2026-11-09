import { describe, expect, test } from "bun:test";
import type { ClaudeCredential, CredentialOf, CredentialSpec } from "../../src/core/credential.ts";
import type { HeadlessOptions } from "../../src/core/run.ts";
import { secret } from "../../src/core/secret.ts";

describe("credential types", () => {
  test("an unknown harness id accepts the generic spec shape", () => {
    const fake: HeadlessOptions<"fake">["credential"] = { mode: "x" };
    expect(fake.mode).toBe("x");
  });

  test("the claude credential rejects a bare mode with no fields", () => {
    // @ts-expect-error a claude credential needs its key, token, selector or acknowledgement
    const claude: HeadlessOptions<"claude">["credential"] = { mode: "x" };
    expect(JSON.stringify(claude)).toBe('{"mode":"x"}');
  });

  test("each known harness accepts its own well-formed credentials", () => {
    const claudeKey: CredentialOf<"claude"> = { mode: "api-key", key: secret("k") };
    const claudeCloud: ClaudeCredential = { mode: "cloud", selector: "bedrock" };
    const codexKey: CredentialOf<"codex"> = { mode: "api-key", key: secret("k") };
    const openCodeKey: CredentialOf<"opencode"> = { mode: "api-key", key: secret("k"), provider: "anthropic" };
    const spec: CredentialSpec = { mode: "login-store", acknowledgePolicy: true };
    expect([claudeKey.mode, claudeCloud.mode, codexKey.mode, openCodeKey.mode, spec.mode]).toEqual([
      "api-key",
      "cloud",
      "api-key",
      "api-key",
      "login-store",
    ]);
  });

  test("a claude login-store or token credential must carry the acknowledgement", () => {
    // @ts-expect-error acknowledgePolicy must be the literal true
    const loginStore: CredentialOf<"claude"> = { mode: "login-store", acknowledgePolicy: false };
    // @ts-expect-error a token credential has no key field
    const token: CredentialOf<"claude"> = { mode: "token", key: secret("k"), acknowledgePolicy: true };
    expect(loginStore.mode).toBe("login-store");
    expect(token.mode).toBe("token");
  });

  test("an unknown harness id falls back to the generic spec for CredentialOf", () => {
    const generic: CredentialOf<"fake"> = { mode: "anything", provider: "p" };
    expect(generic.mode).toBe("anything");
  });
});
