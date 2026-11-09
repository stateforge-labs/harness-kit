import { describe, expect, test } from "bun:test";
import type { CredentialPlan } from "../../src/core/credential-plan.ts";
import { secret } from "../../src/core/secret.ts";
import { buildChildEnv, inheritEnv, probeEnv } from "../../src/driver/env-plan.ts";
import { ambientEnv, SENTINEL } from "../support/credential.ts";

function planWith(inject: CredentialPlan["inject"], strip: readonly string[]): CredentialPlan {
  return { mode: "api-key", strip, inject, acknowledgement: null, billing: "per-token" };
}

describe("buildChildEnv", () => {
  const strip = ["STRIP_A", "STRIP_B"];
  const base = { ...ambientEnv(strip, "/h/u"), NESTED: "n", KEEP: "k", EMPTY_STRIP: "" };

  test("removes strip, injects secrets and literals, removes nested names, sets the home variable", () => {
    const child = buildChildEnv({
      base: inheritEnv(base),
      plan: planWith({ INJECT_SECRET: secret(SENTINEL), INJECT_LITERAL: "1" }, [...strip, "EMPTY_STRIP"]),
      nestedEnv: ["NESTED"],
      homeVar: "HOME_VAR",
      isolationDir: "/iso/dir",
    });
    expect(child.env.INJECT_SECRET).toBe(SENTINEL);
    expect(child.env.INJECT_LITERAL).toBe("1");
    expect(child.env.STRIP_A).toBeUndefined();
    expect(child.env.STRIP_B).toBeUndefined();
    expect(child.env.NESTED).toBeUndefined();
    expect(child.env.KEEP).toBe("k");
    expect(child.env.HOME_VAR).toBe("/iso/dir");
    expect(child.injected).toEqual(["INJECT_SECRET", "INJECT_LITERAL"]);
    expect(child.secrets).toEqual([SENTINEL]);
    expect(child.scrubbed).toEqual(strip);
    expect(child.set).toEqual(["HOME_VAR"]);
  });

  test("a null isolation directory sets nothing and leaves the home variable as the base had it", () => {
    const child = buildChildEnv({ base: inheritEnv(base), plan: planWith({}, strip), nestedEnv: [], homeVar: "HOME_VAR", isolationDir: null });
    expect(child.set).toEqual([]);
    expect(child.env.HOME_VAR).toBeUndefined();
    expect(child.injected).toEqual([]);
    expect(child.secrets).toEqual([]);
  });

  test("an injected name overrides a base value, and a stripped name that is also injected ends up injected", () => {
    const child = buildChildEnv({
      base: inheritEnv(base),
      plan: planWith({ STRIP_A: secret(SENTINEL) }, strip),
      nestedEnv: [],
      homeVar: "HOME_VAR",
      isolationDir: null,
    });
    expect(child.env.STRIP_A).toBe(SENTINEL);
    expect(child.scrubbed).toEqual(strip);
  });

  test("undefined base values are dropped, and scrubbed lists only names present and non-empty", () => {
    const child = buildChildEnv({
      base: inheritEnv({ HOME: "/h/u", ONLY_HERE: "x", UNSET: undefined }),
      plan: planWith({}, ["ONLY_HERE", "UNSET", "EMPTY_STRIP"]),
      nestedEnv: [],
      homeVar: "HOME_VAR",
      isolationDir: null,
    });
    expect(child.env).toEqual({ HOME: "/h/u" });
    expect(child.scrubbed).toEqual(["ONLY_HERE"]);
  });

  test("the base object is not mutated", () => {
    const snapshot = { ...base };
    buildChildEnv({ base: inheritEnv(base), plan: planWith({ X: secret(SENTINEL) }, strip), nestedEnv: ["NESTED"], homeVar: "HOME_VAR", isolationDir: "/d" });
    expect(base).toEqual(snapshot);
  });
});

describe("probeEnv", () => {
  test("removes strip and nested names, keeps everything else, injects nothing", () => {
    const env = probeEnv({ A: "1", B: "2", C: "3", HOME: "/h" }, ["A"], ["B"]);
    expect(env).toEqual({ C: "3", HOME: "/h" });
  });

  test("drops undefined values from the base", () => {
    expect(probeEnv({ A: undefined, HOME: "/h" }, [], [])).toEqual({ HOME: "/h" });
  });
});
