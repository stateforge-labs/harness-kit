import { describe, expect, test } from "bun:test";
import { inspect } from "node:util";
import { secret, secretIsEmpty } from "../../src/core/secret.ts";

describe("secretIsEmpty", () => {
  test("is true only for the empty secret", () => {
    expect(secretIsEmpty(secret(""))).toBe(true);
    expect(secretIsEmpty(secret("x"))).toBe(false);
    expect(secretIsEmpty(secret(" "))).toBe(false);
  });

  test("does not expose the value in any printed form", () => {
    const value = secret("sk-SENTINEL-7f3a9c");
    secretIsEmpty(value);
    expect(JSON.stringify(value)).not.toContain("sk-SENTINEL-7f3a9c");
    expect(inspect(value, { depth: 9 })).not.toContain("sk-SENTINEL-7f3a9c");
  });
});
