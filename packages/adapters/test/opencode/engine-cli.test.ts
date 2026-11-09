import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { opencodeCli } from "../../src/opencode/engines/cli.ts";
import { opencodeArgs } from "../../src/opencode/launch.ts";
import type { OpenCodeCredential } from "../../src/core/credential.ts";
import { secret } from "../../src/core/secret.ts";
import type { EngineInput, ResolvedOptions } from "../../src/driver/port.ts";
import { adaptersFixtures } from "../support/fixtures.ts";
import { type InterpretRaw, interpretRaw } from "../support/interpret.ts";
import { opencodeOptions } from "./options.ts";

const headless = join(adaptersFixtures, "opencode", "headless");
const synthetic = join(adaptersFixtures, "opencode", "synthetic");
const stream = readFileSync(join(synthetic, "stream.jsonl"), "utf8");
const errored = readFileSync(join(headless, "opencode-stream.jsonl"), "utf8");
const help = readFileSync(join(headless, "help.txt"), "utf8");
const credential: OpenCodeCredential = { mode: "api-key", key: secret("sk-test"), provider: "anthropic" };
const base: ResolvedOptions = opencodeOptions();

function input(overrides: Partial<EngineInput<"opencode">> = {}): EngineInput<"opencode"> {
  return { options: base, credential, instructions: "SYS", input: "hello", outFile: "/work/unused.md", runId: "run-1", ...overrides };
}

function withOptions(overrides: Partial<ResolvedOptions>): EngineInput<"opencode"> {
  return input({ options: { ...base, ...overrides } });
}

function raw(out: string, code: number | null = 0): InterpretRaw {
  return { stdout: out, stderrTail: "", exit: { code, signal: null }, outFileText: null, requestedModel: null };
}

describe("opencodeCli invocation", () => {
  test("default argv runs standalone in json format with a title unique to the run", () => {
    const result = opencodeCli.invocation(input());
    expect(result.ok && result.value.args).toEqual(["run", "--standalone", "--format", "json", "--title", "headless-run-1"]);
  });

  test("model adds the model flag", () => {
    const result = opencodeCli.invocation(withOptions({ model: "anthropic/claude-haiku-5-5" }));
    expect(result.ok && result.value.args.slice(-2)).toEqual(["-m", "anthropic/claude-haiku-5-5"]);
  });

  test("stdin is instructions, a blank line, then the input, with no outFile", () => {
    const result = opencodeCli.invocation(input());
    if (!result.ok) {
      throw new Error("expected ok");
    }
    expect(result.value.stdin).toBe("SYS\n\nhello");
    expect(result.value.outFile).toBeNull();
    expect(result.value.argvCarries).toEqual(["instructions"]);
    expect(result.value.program).toBe("opencode");
  });

  test("matches the 0.1.0 builder once the standalone flag is removed", () => {
    const result = opencodeCli.invocation(withOptions({ model: "m" }));
    const args = result.ok ? result.value.args.filter((token) => token !== "--standalone") : [];
    expect(args).toEqual(opencodeArgs({ model: "m", title: "headless-run-1" }));
  });

  test("an effort is unsupported", () => {
    const result = opencodeCli.invocation(withOptions({ effort: "low" }));
    expect(!result.ok && result.failure.kind).toBe("unsupported");
  });

  test("non-persistence is accepted because the session is deleted after the run", () => {
    const result = opencodeCli.invocation(withOptions({ persist: false }));
    expect(result.ok).toBe(true);
  });

  test("too-large when the argv exceeds maxArgvBytes", () => {
    const result = opencodeCli.invocation(withOptions({ maxArgvBytes: 10 }));
    expect(!result.ok && result.failure.kind).toBe("too-large");
  });
});

describe("opencodeCli interpret", () => {
  test("reads the synthetic stream", async () => {
    const result = await interpretRaw(opencodeCli, raw(stream));
    if (!result.ok) {
      throw new Error("expected ok");
    }
    expect(result.value.text).toBe("ok");
    expect(result.value.cost).toEqual({ usd: 0.0012, basis: "unreported" });
    expect(result.value.sessionId as string | null).toBe("ses_00000000000000000000000002");
    expect(result.value.model).toBeNull();
    expect(result.value.usage.totalTokens).toBeNull();
    expect(result.value.unrecognised).toEqual([]);
  });

  test("an error row is an exit failure without asserting the masked message", async () => {
    const result = await interpretRaw(opencodeCli, raw(errored));
    expect(!result.ok && result.failure.kind).toBe("exit");
  });

  test("a non-zero exit is an exit failure", async () => {
    const result = await interpretRaw(opencodeCli, raw(stream, 1));
    expect(!result.ok && result.failure.kind).toBe("exit");
  });

  test("a stream with no text is unparsable", async () => {
    const result = await interpretRaw(opencodeCli, raw('{"type":"step_start","sessionID":"ses_1"}\n'));
    expect(!result.ok && result.failure.kind).toBe("unparsable");
  });

  test("unknown event types are reported as unrecognised", async () => {
    const result = await interpretRaw(opencodeCli, raw(`${stream}\n{"type":"mystery"}\n`));
    if (!result.ok) {
      throw new Error("expected ok");
    }
    expect(result.value.unrecognised).toEqual([{ type: "mystery" }]);
  });

  test("never throws on hostile stdout", async () => {
    for (const out of ["", "{", "\u0000", "x".repeat(1_000_000)]) {
      const result = await interpretRaw(opencodeCli, raw(out));
      expect(result.ok).toBe(false);
    }
  });

  test("text rows are read by parseLine", () => {
    expect(opencodeCli.parseLine('{"type":"text","part":{"text":"ok"}}')).toEqual([{ kind: "text", text: "ok" }]);
    expect(opencodeCli.parseLine("not json")).toEqual([]);
  });

  test("help probe requires the standalone flag", () => {
    expect(opencodeCli.helpArgs).toEqual(["run", "--help"]);
    expect(opencodeCli.checkHelp(help).ok).toBe(true);
    const missing = opencodeCli.checkHelp("usage: opencode run --format json");
    expect(!missing.ok && missing.failure.kind).toBe("unsupported");
  });
});

describe("opencodeCli run title", () => {
  test("the title carries the run id so two runs never share one", () => {
    const first = opencodeCli.invocation(input({ runId: "a-1" }));
    const second = opencodeCli.invocation(input({ runId: "a-2" }));
    const titles = [first, second].map((result) => (result.ok ? result.value.args[result.value.args.indexOf("--title") + 1] : null));
    expect(titles).toEqual(["headless-a-1", "headless-a-2"]);
  });
});
