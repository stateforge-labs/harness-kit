import { describe, expect, test } from "bun:test";
import { secret } from "../../src/core/secret.ts";
import { SENTINEL, binFs, fixture, routedRig } from "./support.ts";
import { ISOLATION_PREFIX } from "../../src/driver/constants.ts";

const CRED = { mode: "api-key", key: secret(SENTINEL) };
const PRIVATE_DELETE = { kind: "private-home", retain: "delete" };
const PRIVATE_KEEP = { kind: "private-home", retain: "keep" };
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20));

describe("binary and version gating", () => {
  test("a missing binary gives unavailable/binary-missing with no spawn", async () => {
    const { runtime, specs } = routedRig({ stdout: "" }, {}, { fs: binFs([]) });
    const result = await runtime.headless("claude", { credential: CRED } as never).run({ instructions: "x", input: "y" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("unavailable");
      expect(result.failure.kind === "unavailable" ? result.failure.reason : null).toBe("binary-missing");
    }
    expect(specs.length).toBe(0);
  });

  test("acceptVersions rejects an unlisted version and accepts a listed one", async () => {
    const rejected = routedRig({ stdout: fixture("claude", "claude-result.json") });
    const refused = await rejected.runtime.headless("claude", { credential: CRED, acceptVersions: ["9.9.9"] } as never).run({ instructions: "x", input: "y" });
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.failure.kind === "unavailable" ? refused.failure.reason : null).toBe("version-not-accepted");
    }
    const accepted = routedRig({ stdout: fixture("claude", "claude-result.json") });
    const allowed = await accepted.runtime.headless("claude", { credential: CRED, acceptVersions: ["2.1.319"] } as never).run({ instructions: "x", input: "y" });
    expect(allowed.ok).toBe(true);
  });
});

describe("close aborts held runs and removes directories", () => {
  test("a kept isolation dir survives close", async () => {
    const { runtime, fs } = routedRig({ stdout: fixture("claude", "claude-result.json") });
    const done = await runtime.headless("claude", { credential: CRED, isolation: PRIVATE_KEEP } as never).run({ instructions: "x", input: "y" });
    expect(done.ok).toBe(true);
    await runtime.close();
    expect(fs.removed.some((path) => path.includes(ISOLATION_PREFIX))).toBe(false);
    expect([...fs.dirs].some((path) => path.includes(ISOLATION_PREFIX))).toBe(true);
  });

  test("close aborts a held run, returns after it ends, and removes the delete dir", async () => {
    const { runtime, specs, fs } = routedRig({ stdout: "", hold: true });
    const held = runtime.headless("claude", { credential: CRED, isolation: PRIVATE_DELETE } as never).run({ instructions: "x", input: "y" });
    await settle();
    expect(specs.some((spec) => !spec.args.includes("--version"))).toBe(true);
    await runtime.close();
    const result = await held;
    expect(result.ok).toBe(false);
    expect(fs.removed.some((path) => path.includes(ISOLATION_PREFIX))).toBe(true);
  });

  test("a run after close gives unavailable/runtime-closed", async () => {
    const { runtime } = routedRig({ stdout: fixture("claude", "claude-result.json") });
    await runtime.close();
    const result = await runtime.headless("claude", { credential: CRED } as never).run({ instructions: "x", input: "y" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind === "unavailable" ? result.failure.reason : null).toBe("runtime-closed");
    }
  });

  test("close is idempotent", async () => {
    const { runtime } = routedRig({ stdout: "" });
    await runtime.close();
    await runtime.close();
    expect(true).toBe(true);
  });
});
