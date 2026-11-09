import { describe, expect, test } from "bun:test";
import { CapabilityName } from "../../src/core/capability.ts";
import { secret } from "../../src/core/secret.ts";
import { OPENCODE_STREAM, SENTINEL, fixture, routedRig } from "./support.ts";

const CREDENTIAL = { mode: "api-key", key: secret(SENTINEL), provider: "openai" };
const NO_STANDALONE = "OpenCode v2\n\nFLAGS\n  --format choice  Output format\n  --model, -m string  Model\n";

function helpSpawns(specs: readonly { readonly args: readonly string[] }[]): number {
  return specs.filter((spec) => spec.args.includes("--help")).length;
}

describe("opencode standalone help preflight", () => {
  test("the help preflight runs once for two runs on the same runtime", async () => {
    const { runtime, specs } = routedRig({ stdout: OPENCODE_STREAM });
    const handle = runtime.headless("opencode", { credential: CREDENTIAL } as never);
    const first = await handle.run({ instructions: "x", input: "y" });
    const second = await handle.run({ instructions: "x", input: "y" });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(helpSpawns(specs)).toBe(1);
  });

  test("help without --standalone gives unsupported", async () => {
    const { runtime, specs } = routedRig({ stdout: OPENCODE_STREAM }, {}, { help: NO_STANDALONE });
    const result = await runtime.headless("opencode", { credential: CREDENTIAL } as never).run({ instructions: "x", input: "y" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("unsupported");
    }
    expect(specs.some((spec) => spec.args.includes("--standalone"))).toBe(false);
  });

  test("a Full hermetic opencode run gives unsupported for settings sources", async () => {
    const { runtime, specs } = routedRig({ stdout: OPENCODE_STREAM });
    const result = await runtime.headless("opencode", { credential: CREDENTIAL, hermetic: "full" } as never).run({ instructions: "x", input: "y" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("unsupported");
      expect(result.failure.kind === "unsupported" ? result.failure.capability : null).toBe(CapabilityName.SettingsSources);
    }
    expect(specs.filter((spec) => !spec.args.includes("--version") && !spec.args.includes("--help")).length).toBe(0);
  });

  test("the fixture help text carries the standalone flag", () => {
    expect(fixture("opencode", "help.txt").includes("--standalone")).toBe(true);
  });
});
