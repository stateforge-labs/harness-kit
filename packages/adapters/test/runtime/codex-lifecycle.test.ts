import { describe, expect, test } from "bun:test";
import { secret } from "../../src/core/secret.ts";
import { CODEX_MESSAGE, SCRATCH_OUT, SENTINEL, routedRig } from "./support.ts";

const CRED = { mode: "api-key", key: secret(SENTINEL) } as never;
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
});
