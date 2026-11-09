import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { codexCli } from "../../src/codex/engines/cli.ts";
import { codexExec } from "../../src/codex/exec.ts";
import type { CodexCredential } from "../../src/core/credential.ts";
import { secret } from "../../src/core/secret.ts";
import { Hermetic } from "../../src/core/run.ts";
import type { EngineInput, ResolvedOptions } from "../../src/driver/port.ts";
import { adaptersFixtures } from "../support/fixtures.ts";
import { type InterpretRaw, interpretRaw } from "../support/interpret.ts";

const headless = join(adaptersFixtures, "codex", "headless");
const stdout = readFileSync(join(headless, "codex-exec-stdout.txt"), "utf8");
const last = readFileSync(join(headless, "codex-last.md"), "utf8");
const credential: CodexCredential = { mode: "api-key", key: secret("sk-test") };
const base: ResolvedOptions = {
  model: null,
  effort: null,
  hermetic: Hermetic.None,
  persist: true,
  maxArgvBytes: null,
  cwd: "/work",
  isolation: { kind: "none" },
};

function input(overrides: Partial<EngineInput<"codex">> = {}): EngineInput<"codex"> {
  return { options: base, credential, instructions: "SYS", input: "hello", outFile: "/work/last.md", runId: "run-1", ...overrides };
}

function withOptions(overrides: Partial<ResolvedOptions>): EngineInput<"codex"> {
  return input({ options: { ...base, ...overrides } });
}

function raw(out: string, code: number | null = 0, outFileText: string | null = last): InterpretRaw {
  return { stdout: out, stderrTail: "", exit: { code, signal: null }, outFileText, requestedModel: null };
}

describe("codexCli invocation", () => {
  test("default argv writes the last message and reads stdin", () => {
    const result = codexCli.invocation(input());
    expect(result.ok && result.value.args).toEqual(["exec", "--color", "never", "-o", "/work/last.md", "-"]);
  });

  test("stdin is instructions, a blank line, then the input", () => {
    const result = codexCli.invocation(input());
    if (!result.ok) {
      throw new Error("expected ok");
    }
    expect(result.value.stdin).toBe("SYS\n\nhello");
    expect(result.value.outFile).toBe("/work/last.md");
    expect(result.value.argvCarries).toEqual([]);
    expect(result.value.program).toBe("codex");
  });

  test("non-persistence adds the ephemeral flag", () => {
    const result = codexCli.invocation(withOptions({ persist: false }));
    expect(result.ok && result.value.args.slice(0, 3)).toEqual(["exec", "--ephemeral", "--color"]);
  });

  test("model and a measured-neutral effort add their flags", () => {
    const result = codexCli.invocation(withOptions({ model: "gpt-6.1-sol", effort: "low" }));
    expect(result.ok && result.value.args).toEqual(["exec", "--color", "never", "-m", "gpt-6.1-sol", "-c", "model_reasoning_effort=low", "-o", "/work/last.md", "-"]);
  });

  test("full hermetic run matches the 0.1.0 exec builder exactly", () => {
    const result = codexCli.invocation(withOptions({ model: "gpt-6.1-sol", effort: "low", persist: false, hermetic: Hermetic.Full }));
    expect(result.ok && result.value.args).toEqual(
      codexExec({ model: "gpt-6.1-sol", effort: "low", outFile: "/work/last.md" }).args,
    );
  });

  test("a native effort is unsupported because codex effort is unmeasured", () => {
    const result = codexCli.invocation(withOptions({ effort: { native: "high" } }));
    expect(!result.ok && result.failure.kind).toBe("unsupported");
  });

  test("too-large when the argv exceeds maxArgvBytes", () => {
    const result = codexCli.invocation(withOptions({ maxArgvBytes: 10 }));
    expect(!result.ok && result.failure.kind).toBe("too-large");
  });
});

describe("codexCli interpret", () => {
  test("reads the masked exec stdout and last message fixtures", async () => {
    const result = await interpretRaw(codexCli, raw(stdout));
    if (!result.ok) {
      throw new Error("expected ok");
    }
    expect(result.value.text).toBe("ok");
    expect(result.value.sessionId as string | null).toBe("00000000-0000-4000-8000-0000000001fc");
    expect(result.value.model).toBe("gpt-6.1-sol");
    expect(result.value.usage.totalTokens).toBe(3834);
    expect(result.value.cost).toEqual({ usd: null, basis: "unavailable" });
    expect(result.value.unrecognised).toEqual([]);
  });

  test("a non-zero exit is an exit failure", async () => {
    const result = await interpretRaw(codexCli, raw(stdout, 1));
    expect(!result.ok && result.failure.kind).toBe("exit");
  });

  test("an empty last message is unparsable", async () => {
    const result = await interpretRaw(codexCli, raw(stdout, 0, "  \n"));
    expect(!result.ok && result.failure.kind).toBe("unparsable");
  });

  test("a missing last message file is unparsable", async () => {
    const result = await interpretRaw(codexCli, raw(stdout, 0, null));
    expect(!result.ok && result.failure.kind).toBe("unparsable");
  });

  test("never throws on hostile stdout", async () => {
    for (const out of ["", "{", "\u0000", "x".repeat(1_000_000)]) {
      const result = await interpretRaw(codexCli, raw(out));
      expect(result.ok).toBe(true);
    }
  });

  test("has no line reader and no help probe", () => {
    expect(codexCli.parseLine("anything")).toEqual([]);
    expect(codexCli.helpArgs).toBeNull();
  });
});
