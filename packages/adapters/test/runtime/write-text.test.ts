import { describe, expect, test } from "bun:test";
import { fakeFs } from "../../src/testing/index.ts";
import { secret } from "../../src/core/secret.ts";
import { CODEX_MESSAGE, routedRig, SCRATCH_OUT, SENTINEL } from "./support.ts";

const API_KEY = { mode: "api-key", key: secret(SENTINEL) } as never;
const OPENCODE_KEY = { mode: "api-key", key: secret(SENTINEL), provider: "openai" } as never;
const REQUEST = { instructions: "x", input: "y" };
const SCHEMA = { type: "object" } as const;

describe("fakeFs writeText", () => {
  test("fakeFs writeText stores the text", async () => {
    const fs = fakeFs({ dirs: ["/d"] });
    expect(await fs.writeText?.("/d/a.json", "{}")).toBe(true);
    expect(await fs.readText("/d/a.json", 100)).toBe("{}");
    expect(fs.written.get("/d/a.json")).toBe("{}");
  });

  test("fakeFs writeText refuses a missing parent", async () => {
    const fs = fakeFs();
    expect(await fs.writeText?.("/nope/a.json", "{}")).toBe(false);
    expect(await fs.exists("/nope/a.json")).toBe(false);
    expect(fs.written.size).toBe(0);
  });
});

describe("outputSchema refused where structured output is not usable", () => {
  test("opencode refuses outputSchema up front", () => {
    const { runtime, specs } = routedRig({ stdout: "" });
    const planned = runtime.headless("opencode", { credential: OPENCODE_KEY } as never).plan({ ...REQUEST, outputSchema: SCHEMA });
    expect(planned.ok).toBe(false);
    expect(!planned.ok && planned.failure).toMatchObject({
      kind: "unsupported",
      capability: "structured-output",
      engine: "cli",
      why: "not-implemented",
    });
    expect(specs.length).toBe(0);
  });

  test("opencode run with outputSchema never spawns", async () => {
    const { runtime, specs } = routedRig({ stdout: "" });
    const result = await runtime.headless("opencode", { credential: OPENCODE_KEY } as never).run({ ...REQUEST, outputSchema: SCHEMA });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.failure).toMatchObject({ kind: "unsupported", capability: "structured-output", why: "not-implemented" });
    expect(specs.length).toBe(0);
  });

  test("no schema, codex runs as today", async () => {
    const { runtime, fs } = routedRig({ stdout: "" }, {}, { files: { [SCRATCH_OUT]: CODEX_MESSAGE } });
    const result = await runtime.headless("codex", { credential: API_KEY } as never).run(REQUEST);
    expect(result.ok && result.value.text).toBe("hello from codex");
    expect(fs.written.size).toBe(0);
  });
});
