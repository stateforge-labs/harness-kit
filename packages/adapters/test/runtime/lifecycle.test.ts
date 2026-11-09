import { describe, expect, test } from "bun:test";
import { secret } from "../../src/core/secret.ts";
import { SENTINEL, binFs, fixture, routedRig } from "./support.ts";
import { CWD_PREFIX } from "../../src/driver/constants.ts";

const CRED = { mode: "api-key", key: secret(SENTINEL) };
const PRIVATE_DELETE = { private: "delete" };
const PRIVATE_KEEP = { private: "keep" };
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

  test("a run succeeds whatever version the binary reports", async () => {
    const rig = routedRig({ stdout: fixture("claude", "claude-stream-json-verbose.jsonl") });
    const result = await rig.runtime.headless("claude", { credential: CRED } as never).run({ instructions: "x", input: "y" });
    expect(result.ok).toBe(true);
  });
});

describe("close aborts held runs and removes directories", () => {
  test("a kept private cwd survives close", async () => {
    const { runtime, fs } = routedRig({ stdout: fixture("claude", "claude-stream-json-verbose.jsonl") });
    const done = await runtime.headless("claude", { credential: CRED, cwd: PRIVATE_KEEP } as never).run({ instructions: "x", input: "y" });
    expect(done.ok).toBe(true);
    await runtime.close();
    expect(fs.removed.some((path) => path.includes(CWD_PREFIX))).toBe(false);
    expect([...fs.dirs].some((path) => path.includes(CWD_PREFIX))).toBe(true);
  });

  test("close aborts a held run, returns after it ends, and removes the delete dir", async () => {
    const { runtime, specs, fs } = routedRig({ stdout: "", hold: true });
    const held = runtime.headless("claude", { credential: CRED, cwd: PRIVATE_DELETE } as never).run({ instructions: "x", input: "y" });
    await settle();
    expect(specs.some((spec) => !spec.args.includes("--version"))).toBe(true);
    await runtime.close();
    const result = await held;
    expect(result.ok).toBe(false);
    expect(fs.removed.some((path) => path.includes(CWD_PREFIX))).toBe(true);
  });

  test("a run after close gives unavailable/runtime-closed", async () => {
    const { runtime } = routedRig({ stdout: fixture("claude", "claude-stream-json-verbose.jsonl") });
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
