import { describe, expect, test } from "bun:test";
import { CodexCli } from "../../src/codex/constants.ts";
import { OpenCodeCli } from "../../src/opencode/constants.ts";
import { secret } from "../../src/core/secret.ts";
import { CODEX_MESSAGE, OPENCODE_STREAM, SCRATCH_OUT, SENTINEL, routedRig } from "./support.ts";

const CRED = { mode: "api-key", key: secret(SENTINEL) } as never;
const REQUEST = { instructions: "x", input: "y" };

describe("maxTurns on a harness with no turn cap", () => {
  test("codex refuses maxTurns before any spawn", async () => {
    const { runtime, specs } = routedRig({ stdout: "" }, {}, { files: { [SCRATCH_OUT]: CODEX_MESSAGE } });
    const ran = await runtime.headless("codex", { credential: CRED } as never).run({ ...REQUEST, maxTurns: 2 } as never);
    expect(!ran.ok && ran.failure).toMatchObject({ kind: "unsupported", capability: "max-turns" });
    expect(specs.some((spec) => spec.args.includes(CodexCli.Exec))).toBe(false);
  });

  test("opencode refuses maxTurns before any spawn", async () => {
    const { runtime, specs } = routedRig({ stdout: OPENCODE_STREAM });
    const ran = await runtime.headless("opencode", { credential: { mode: "api-key", key: secret(SENTINEL), provider: "openai" } } as never).run({ ...REQUEST, maxTurns: 2 } as never);
    expect(!ran.ok && ran.failure).toMatchObject({ kind: "unsupported", capability: "max-turns" });
    expect(specs.some((spec) => spec.args.includes(OpenCodeCli.Standalone))).toBe(false);
  });

  test("claude accepts maxTurns", () => {
    const { runtime } = routedRig({ stdout: "" });
    const planned = runtime.headless("claude", { credential: CRED } as never).plan({ ...REQUEST, maxTurns: 2 } as never);
    expect(planned.ok).toBe(true);
  });
});
