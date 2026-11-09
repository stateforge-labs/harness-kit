import { describe, expect, test } from "bun:test";
import { secret } from "../../src/core/secret.ts";
import { CWD_PREFIX, KILL_GRACE_MS, SCRATCH_PREFIX } from "../../src/driver/constants.ts";
import { fakeClock } from "../support/fakes.ts";
import { CODEX_MESSAGE, SCRATCH_OUT, SENTINEL, routedRig } from "./support.ts";

const CRED = { mode: "api-key", key: secret(SENTINEL) } as never;
const TIMEOUT_OUT = `/tmp/${SCRATCH_PREFIX}2/last-message.txt`;
const REQUEST = { instructions: "x", input: "y" };

function scratchRemoved(removed: readonly string[]): boolean {
  return removed.some((path) => SCRATCH_OUT.startsWith(path));
}

describe("codex out-file lifecycle", () => {
  test("a successful run reads the last message and removes the scratch dir", async () => {
    const { runtime, fs } = routedRig({ stdout: "" }, {}, { files: { [SCRATCH_OUT]: CODEX_MESSAGE } });
    const result = await runtime.headless("codex", { credential: CRED } as never).run(REQUEST);
    expect(result.ok).toBe(true);
    expect(scratchRemoved(fs.removed)).toBe(true);
  });

  test("a non-zero exit still removes the scratch dir", async () => {
    const { runtime, fs } = routedRig({ stdout: "", code: 1 }, {}, { files: { [SCRATCH_OUT]: CODEX_MESSAGE } });
    const result = await runtime.headless("codex", { credential: CRED } as never).run(REQUEST);
    expect(result.ok).toBe(false);
    expect(scratchRemoved(fs.removed)).toBe(true);
  });

  test("a non-persisted run uses the ephemeral flag and removes the scratch dir", async () => {
    const { runtime, specs, fs } = routedRig({ stdout: "" }, {}, { files: { [SCRATCH_OUT]: CODEX_MESSAGE } });
    await runtime.headless("codex", { credential: CRED, persist: false } as never).run(REQUEST);
    const run = specs.find((spec) => spec.args.includes("exec"));
    expect(run?.args).toContain("--ephemeral");
    expect(scratchRemoved(fs.removed)).toBe(true);
  });

  test("a timed-out run leaves no out file and no private cwd", async () => {
    const clock = fakeClock(0);
    const { runtime, specs, fs } = routedRig({ stdout: "", hold: true }, { clock }, { files: { [TIMEOUT_OUT]: CODEX_MESSAGE } });
    const pending = runtime.headless("codex", { credential: CRED, cwd: { private: "delete" }, timeoutMs: 100 } as never).run(REQUEST);
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
    expect(specs.some((spec) => spec.args.includes("exec"))).toBe(true);
    expect(await fs.exists(TIMEOUT_OUT)).toBe(true);
    clock.advance(100);
    clock.advance(KILL_GRACE_MS);
    const result = await pending;
    expect(!result.ok && result.failure.kind).toBe("timeout");
    expect(await fs.exists(TIMEOUT_OUT)).toBe(false);
    expect([...fs.dirs].filter((path) => path.includes(CWD_PREFIX) || path.includes(SCRATCH_PREFIX))).toEqual([]);
    expect(fs.removed.some((path) => path.includes(CWD_PREFIX))).toBe(true);
    expect(fs.removed.some((path) => path.includes(SCRATCH_PREFIX))).toBe(true);
  });
});
