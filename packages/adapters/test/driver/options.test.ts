import { describe, expect, test } from "bun:test";
import type { CredentialSpec } from "../../src/core/credential.ts";
import { Engine } from "../../src/core/capability.ts";
import { DEFAULT_LIMITS } from "../../src/driver/constants.ts";
import { isPositiveInteger, pick } from "../../src/driver/options-merge.ts";
import { TOOLS_DEFAULT, TOOLS_OFF } from "../../src/core/policy.ts";
import { FAKE_STRIP } from "../support/fake-driver.ts";
import { ambientEnv, failureOf, valueOf } from "../support/credential.ts";
import { prep } from "../support/prepare.ts";

describe("pick", () => {
  test("call beats consumer beats fact, and undefined does not count as set", () => {
    expect(pick("c", "k", "f")).toBe("c");
    expect(pick(undefined, "k", "f")).toBe("k");
    expect(pick(undefined, undefined, "f")).toBe("f");
  });

  test("a null call value still counts as set", () => {
    expect(pick<string | null>(null, "k", "f")).toBeNull();
  });
});

describe("isPositiveInteger", () => {
  test.each([
    [1, true],
    [4096, true],
    [0, false],
    [-1, false],
    [1.5, false],
    [Number.NaN, false],
    ["3", false],
  ])("%p is %p", (value, expected) => {
    expect(isPositiveInteger(value)).toBe(expected);
  });
});

describe("validation failures", () => {
  test.each([
    ["timeoutMs zero", () => prep({ timeoutMs: 0 }), "timeoutMs"],
    ["timeoutMs fractional", () => prep({}, { timeoutMs: 1.5 }), "timeoutMs"],
    ["maxArgvBytes negative", () => prep({ maxArgvBytes: -1 }), "maxArgvBytes"],
    ["model empty", () => prep({ model: "" }), "model"],
    ["input empty", () => prep({}, { input: "" }), "input"],
    ["instructions not a string", () => prep({}, { instructions: 5 as unknown as string }), "instructions"],
    ["credential missing", () => prep({ credential: undefined as unknown as CredentialSpec }), "credential"],
    ["engine unknown", () => prep({ engine: "bogus" as unknown as Engine }), "engine"],
    ["cwd not a string", () => prep({ cwd: 5 as unknown as string }), "cwd"],
    ["cwd private with a bad retain", () => prep({ cwd: { private: "x" } as never }), "cwd"],
    ["limits zero stdout", () => prep({ limits: { maxStdoutBytes: 0 } }), "limits"],
    ["limits fractional stderr", () => prep({ limits: { maxStderrBytes: 2.5 } }), "limits"],
  ])("%s is invalid-config with its field", (_name, run, field) => {
    expect(failureOf(run())).toMatchObject({ kind: "invalid-config", field });
  });

  test("the sdk engine is unsupported while no driver offers it", () => {
    expect(failureOf(prep({ engine: Engine.Sdk }))).toMatchObject({ kind: "unsupported", capability: "engine", engine: "sdk", why: "not-implemented" });
  });

  test("the cli engine is accepted", () => {
    expect(valueOf(prep({ engine: Engine.Cli })).plan.engine).toBe(Engine.Cli);
  });
});

describe("limits", () => {
  test("defaults apply when nothing is given", () => {
    expect(valueOf(prep()).controls.limits).toEqual(DEFAULT_LIMITS);
  });

  test("a lower value is kept and a higher value is clamped to the default", () => {
    const low = valueOf(prep({ limits: { maxStdoutBytes: 1000 } })).controls.limits;
    expect(low.maxStdoutBytes).toBe(1000);
    const high = valueOf(prep({ limits: { maxStdoutBytes: 99_999_999, maxStderrBytes: 99_999_999 } })).controls.limits;
    expect(high).toEqual(DEFAULT_LIMITS);
  });
});

describe("precedence", () => {
  test("a value with no caller takes the fact", () => {
    const prepared = valueOf(prep());
    expect(prepared.plan.options.model).toBeNull();
    expect(prepared.plan.options.persist).toBe(true);
  });

  test("a consumer value overrides the fact", () => {
    const prepared = valueOf(prep({ model: "consumer-model", timeoutMs: 5000 }));
    expect(prepared.plan.options.model).toBe("consumer-model");
    expect(prepared.plan.options.timeoutMs).toBe(5000);
  });

  test("a call value overrides the consumer", () => {
    const prepared = valueOf(prep({ model: "consumer-model", tools: TOOLS_OFF }, { model: "call-model", tools: TOOLS_DEFAULT }));
    expect(prepared.plan.options.model).toBe("call-model");
    expect(prepared.plan.options.tools).toMatchObject({ builtins: "harness-default" });
  });

  test("the signal and the cwd follow the same rule", () => {
    const controller = new AbortController();
    const prepared = valueOf(prep({ cwd: "/consumer" }, { signal: controller.signal }));
    expect(prepared.controls.signal).toBe(controller.signal);
    expect(prepared.plan.options.cwd).toBe("/consumer");
  });
});

describe("check order", () => {
  const noHome = ambientEnv([FAKE_STRIP], null);

  test("invalid-config wins over a credential failure", () => {
    expect(failureOf(prep({ timeoutMs: 0 }, {}, noHome))).toMatchObject({ kind: "invalid-config", field: "timeoutMs" });
  });

  test("a credential failure wins over an unsupported capability", () => {
    expect(failureOf(prep({ tools: TOOLS_OFF }, {}, noHome))).toMatchObject({ kind: "credential", reason: "home-unset" });
  });

  test("an unsupported capability wins over an argv overflow", () => {
    expect(failureOf(prep({ tools: { ...TOOLS_OFF, strict: true } }, { instructions: "x".repeat(3000) }))).toMatchObject({ kind: "unsupported", capability: "settings-sources" });
  });

  test("an argv overflow is too-large on the instructions field", () => {
    expect(failureOf(prep({}, { instructions: "x".repeat(3000) }))).toMatchObject({ kind: "too-large", field: "instructions" });
  });

  test("a raw string credential is rejected as not-a-secret", () => {
    const raw = { mode: "api-key", key: "raw" as unknown as CredentialSpec["key"] } as CredentialSpec;
    expect(failureOf(prep({ credential: raw }))).toMatchObject({ kind: "credential", reason: "not-a-secret", field: "key" });
  });

  test("an unoffered mode is credential-unsupported", () => {
    expect(failureOf(prep({ credential: { mode: "login-store" } }))).toMatchObject({ kind: "credential-unsupported", mode: "login-store" });
  });
});
