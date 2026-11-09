import { describe, expect, test } from "bun:test";
import { codexPolicy } from "../../src/codex/policy.ts";
import { CODEX_UNUSED_FEATURES } from "../../src/codex/exec.ts";
import { resolveTools, TOOLS_DEFAULT, TOOLS_OFF } from "../../src/core/policy.ts";
import type { PolicyInput } from "../../src/driver/port.ts";

const LOCKDOWN = ["--skip-git-repo-check", "--ignore-user-config", "-s", "read-only", ...CODEX_UNUSED_FEATURES.flatMap((feature) => ["--disable", feature])];

function policyFor(tools: ReturnType<typeof resolveTools>): PolicyInput {
  return { tools, credentialMode: "api-key" } as unknown as PolicyInput;
}

describe("codexPolicy", () => {
  test("TOOLS_OFF yields the exact lockdown args and an empty env", () => {
    const result = codexPolicy(policyFor(resolveTools(TOOLS_OFF, undefined)));
    expect(result).toEqual({ ok: true, value: { args: LOCKDOWN, env: {} } });
  });

  test("TOOLS_DEFAULT yields no args and an empty env", () => {
    const result = codexPolicy(policyFor(resolveTools(TOOLS_DEFAULT, undefined)));
    expect(result).toEqual({ ok: true, value: { args: [], env: {} } });
  });
});
