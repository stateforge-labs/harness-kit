import { describe, expect, test } from "bun:test";
import type { ProcessSpec } from "../../src/driver/ports.ts";
import { secret } from "../../src/core/secret.ts";
import type { FakeFs } from "../../src/testing/index.ts";
import { binFs, CODEX_MESSAGE, routedRig, SCRATCH_OUT, SENTINEL } from "../runtime/support.ts";

const API_KEY = { mode: "api-key", key: secret(SENTINEL) } as never;
const OPENCODE_KEY = { mode: "api-key", key: secret(SENTINEL), provider: "openai" } as never;
const REQUEST = { instructions: "x", input: "y" };
const SCHEMA = { type: "object" } as const;
const SCHEMA_PATH = "/tmp/stateforge-adapters-scratch-1/output-schema.json";
const ANSWER = '{"ops":[]}';

function exec(specs: readonly ProcessSpec[]): ProcessSpec | undefined {
  return specs.find((s) => s.args.includes("exec"));
}

describe("codex outputSchema", () => {
  test("schema adds output-schema to the plan", () => {
    const { runtime } = routedRig({ stdout: "" });
    const planned = runtime.headless("codex", { credential: API_KEY } as never).plan({ ...REQUEST, outputSchema: SCHEMA });
    const args = planned.ok && planned.value.engine === "cli" ? planned.value.args : [];
    expect(planned.ok && planned.value.engine).toBe("cli");
    expect(args[args.indexOf("--output-schema") + 1]).toBe("output-schema.json");
    expect(args.indexOf("--output-schema")).toBeLessThan(args.indexOf("-o"));
  });

  test("run writes the schema beside the last message", async () => {
    const { runtime, specs, fs } = routedRig({ stdout: "" }, {}, { files: { [SCRATCH_OUT]: ANSWER } });
    await runtime.headless("codex", { credential: API_KEY } as never).run({ ...REQUEST, outputSchema: SCHEMA });
    expect(fs.written.get(SCHEMA_PATH)).toBe('{"type":"object"}');
    const args = exec(specs)?.args ?? [];
    expect(args[args.indexOf("--output-schema") + 1]).toBe(SCHEMA_PATH);
    expect(args[args.indexOf("-o") + 1]).toBe(SCRATCH_OUT);
  });

  test("structured answer reaches output", async () => {
    const { runtime } = routedRig({ stdout: "" }, {}, { files: { [SCRATCH_OUT]: ANSWER } });
    const result = await runtime.headless("codex", { credential: API_KEY } as never).run({ ...REQUEST, outputSchema: SCHEMA });
    expect(result.ok && result.value.output).toEqual({ ops: [] });
    expect(result.ok && result.value.text).toBe('{"ops":[]}');
  });

  test("a last message that is not JSON is unparsable", async () => {
    const { runtime } = routedRig({ stdout: "" }, {}, { files: { [SCRATCH_OUT]: CODEX_MESSAGE } });
    const result = await runtime.headless("codex", { credential: API_KEY } as never).run({ ...REQUEST, outputSchema: SCHEMA });
    expect(!result.ok && result.failure).toMatchObject({ kind: "unparsable", reason: "not-json" });
  });

  test("a failed schema write stops the run", async () => {
    const base = binFs();
    const fs = { ...base, writeText: async () => false };
    const { runtime, specs } = routedRig({ stdout: "" }, {}, { fs });
    const result = await runtime.headless("codex", { credential: API_KEY } as never).run({ ...REQUEST, outputSchema: SCHEMA });
    expect(!result.ok && result.failure).toMatchObject({ kind: "unavailable", reason: "scratch-failed" });
    expect(exec(specs)).toBeUndefined();
  });

  test("an fs without writeText stops the run", async () => {
    const { writeText: _drop, ...rest } = binFs();
    const fs = rest as FakeFs;
    const { runtime, specs } = routedRig({ stdout: "" }, {}, { fs });
    const result = await runtime.headless("codex", { credential: API_KEY } as never).run({ ...REQUEST, outputSchema: SCHEMA });
    expect(!result.ok && result.failure).toMatchObject({ kind: "unavailable", reason: "scratch-failed" });
    expect(exec(specs)).toBeUndefined();
  });

  test("no schema, argv and output as today", async () => {
    const { runtime, specs, fs } = routedRig({ stdout: "" }, {}, { files: { [SCRATCH_OUT]: CODEX_MESSAGE } });
    const result = await runtime.headless("codex", { credential: API_KEY } as never).run(REQUEST);
    expect(exec(specs)?.args ?? []).not.toContain("--output-schema");
    expect(fs.written.size).toBe(0);
    expect(result.ok && result.value.text).toBe("hello from codex");
    expect(result.ok && result.value.output).toBeUndefined();
  });

  test("opencode still refuses", () => {
    const { runtime } = routedRig({ stdout: "" });
    const planned = runtime.headless("opencode", { credential: OPENCODE_KEY } as never).plan({ ...REQUEST, outputSchema: SCHEMA });
    expect(!planned.ok && planned.failure).toMatchObject({ kind: "unsupported", capability: "structured-output" });
  });
});
