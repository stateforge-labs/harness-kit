import { describe, expect, test } from "bun:test";
import { REDACTED, redactValue, redactor } from "../../src/core/redact.ts";
import { secret } from "../../src/core/secret.ts";

describe("redactor", () => {
  test("replaces every listed value in a string", () => {
    const redact = redactor(["alpha-secret", "beta-token"]);
    expect(redact("a alpha-secret b beta-token c alpha-secret")).toBe(`a ${REDACTED} b ${REDACTED} c ${REDACTED}`);
  });

  test("a longer value that contains a shorter one is replaced whole", () => {
    const redact = redactor(["abc", "abcdef"]);
    expect(redact("xx abcdef yy")).toBe(`xx ${REDACTED} yy`);
  });

  test("the empty string is ignored and never blanks the text", () => {
    const redact = redactor(["", "key"]);
    expect(redact("plain text")).toBe("plain text");
    expect(redact("a key b")).toBe(`a ${REDACTED} b`);
  });

  test("with no usable values the text passes through", () => {
    expect(redactor([])("anything")).toBe("anything");
    expect(redactor([""])("anything")).toBe("anything");
  });

  test("regular expression characters in a value are matched literally", () => {
    const redact = redactor(["a.b*c(d)"]);
    expect(redact("a.b*c(d) and axbbcd")).toBe(`${REDACTED} and axbbcd`);
  });
});

describe("redactValue", () => {
  const SENTINEL = "sk-SENTINEL-7f3a9c";
  const redact = redactor([SENTINEL]);

  test("redacts strings nested in arrays and objects", () => {
    const value = { a: [SENTINEL, { b: `x ${SENTINEL} y` }], c: "ok" };
    expect(redactValue(value, redact)).toEqual({ a: [REDACTED, { b: `x ${REDACTED} y` }], c: "ok" });
  });

  test("leaves numbers, booleans and null alone", () => {
    expect(redactValue({ n: 3, t: true, f: false, z: null }, redact)).toEqual({ n: 3, t: true, f: false, z: null });
  });

  test("returns a new structure and does not mutate the input", () => {
    const input = { a: SENTINEL };
    const out = redactValue(input, redact);
    expect(out).not.toBe(input);
    expect(input.a).toBe(SENTINEL);
  });

  test("a secret wrapper never passes through and is masked", () => {
    expect(redactValue({ s: secret(SENTINEL) }, redact)).toEqual({ s: REDACTED });
  });

  test("past depth 8 a container returns REDACTED", () => {
    let deep: unknown = SENTINEL;
    for (let level = 0; level < 12; level += 1) {
      deep = { next: deep };
    }
    expect(JSON.stringify(redactValue(deep, redact))).not.toContain(SENTINEL);
    expect(JSON.stringify(redactValue(deep, redact))).toContain(REDACTED);
  });

  test("depth eight is still walked", () => {
    let deep: unknown = SENTINEL;
    for (let level = 0; level < 8; level += 1) {
      deep = [deep];
    }
    expect(JSON.stringify(redactValue(deep, redact))).toBe(`${"[".repeat(8)}"${REDACTED}"${"]".repeat(8)}`);
  });

  test("a cyclic structure stops at the depth cap", () => {
    const cycle: Record<string, unknown> = { name: SENTINEL };
    cycle["self"] = cycle;
    const out = JSON.stringify(redactValue(cycle, redact));
    expect(out).not.toContain(SENTINEL);
    expect(out).toContain(REDACTED);
  });
});
