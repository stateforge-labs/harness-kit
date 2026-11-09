import { describe, expect, test } from "bun:test";
import { inspect } from "node:util";
import { SECRET_BRAND, SECRET_REVEAL, isSecret, reveal, secret, type Secret } from "../../src/core/secret.ts";

const SENTINEL = "sk-SENTINEL-7f3a9c";

describe("secret", () => {
  const s = secret(SENTINEL);

  test("no serialising or printing form carries the value", () => {
    const forms = [
      JSON.stringify({ s }),
      String(s),
      `${s}`,
      s + "",
      inspect(s, { depth: 9 }),
      inspect({ a: { s } }, { depth: 9 }),
      JSON.stringify(Object.keys(s)),
      JSON.stringify(Object.getOwnPropertyNames(s)),
      JSON.stringify(Object.entries(s)),
    ];
    for (const form of forms) {
      expect(form).not.toContain(SENTINEL);
    }
  });

  test("the masked text is the literal [secret]", () => {
    expect(String(s)).toBe("[secret]");
    expect(JSON.stringify(s)).toBe('"[secret]"');
    expect(inspect(s)).toBe("[secret]");
  });

  test("reveal returns the value and the wrapper is frozen", () => {
    expect(reveal(s)).toBe(SENTINEL);
    expect(Object.isFrozen(s)).toBe(true);
  });

  test("isSecret recognises a secret and rejects other values", () => {
    expect(isSecret(s)).toBe(true);
    expect(isSecret("x")).toBe(false);
    expect(isSecret({})).toBe(false);
    expect(isSecret(null)).toBe(false);
    expect(isSecret(undefined)).toBe(false);
  });

  test("a duck-typed copy from another install is recognised", () => {
    const other: Secret = { [SECRET_BRAND]: true, [SECRET_REVEAL]: () => "v" };
    expect(isSecret(other)).toBe(true);
    expect(reveal(other)).toBe("v");
  });

  test("an object with only the brand is not a secret", () => {
    expect(isSecret({ [SECRET_BRAND]: true })).toBe(false);
  });

  test("an empty value is still wrapped; emptiness is checked by the credential layer", () => {
    expect(isSecret(secret(""))).toBe(true);
    expect(reveal(secret(""))).toBe("");
  });
});
