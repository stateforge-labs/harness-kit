import { describe, expect, test } from "bun:test";
import type { Runtime } from "../../src/driver/create-runtime.ts";
import { createRuntime } from "../../src/runtime/index.ts";
import { fakeOutput, fakeRuntime, type FakeRuntime, type FakeScripts } from "../../src/testing/index.ts";
import { CapabilityName, Engine } from "../../src/core/capability.ts";
import type { RunFailure } from "../../src/core/failure.ts";
import { TOOLS_OFF } from "../../src/core/policy.ts";
import type { RunOutput, RunRequest } from "../../src/core/run.ts";
import { NO_USAGE } from "../../src/core/kit.ts";

const REQUEST: RunRequest = { instructions: "do", input: "work" };

function output(text: string): RunOutput {
  return fakeOutput({ text });
}

const FAILURE: RunFailure = { kind: "unavailable", message: "scripted failure", reason: "binary-missing" };

function scripted(scripts: FakeScripts): FakeRuntime {
  return fakeRuntime({ scripts });
}

async function collect(stream: AsyncIterable<{ readonly kind: string }>): Promise<string[]> {
  const kinds: string[] = [];
  for await (const event of stream) {
    kinds.push(event.kind);
  }
  return kinds;
}

describe("fakeRuntime scripts", () => {
  test("replays scripted outputs in order, per harness", async () => {
    const runtime = scripted({ claude: [output("first"), output("second")], codex: [output("other")] });
    const handle = runtime.headless("claude", {});
    expect((await handle.run(REQUEST)).ok).toBe(true);
    const first = await handle.run(REQUEST);
    expect(first.ok && first.value.text).toBe("second");
    const codex = await runtime.headless("codex", {}).run(REQUEST);
    expect(codex.ok && codex.value.text).toBe("other");
  });

  test("returns a scripted failure as the run result", async () => {
    const runtime = scripted({ claude: [FAILURE] });
    const result = await runtime.headless("claude", {}).run(REQUEST);
    expect(result).toEqual({ ok: false, failure: FAILURE });
  });

  test("reports an internal-error unavailable once a harness runs out", async () => {
    const runtime = scripted({ claude: [output("only")] });
    const handle = runtime.headless("claude", {});
    await handle.run(REQUEST);
    const result = await handle.run(REQUEST);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.failure).toEqual({ kind: "unavailable", message: "claude: fake runtime script exhausted", reason: "internal-error" });
  });

  test("reports an internal-error unavailable for a harness with no script", async () => {
    const result = await scripted({}).headless("opencode", {}).run(REQUEST);
    expect(!result.ok && result.failure.kind === "unavailable" && result.failure.reason).toBe("internal-error");
  });
});

describe("fakeRuntime stream", () => {
  test("streams started, text and finished for a successful output", async () => {
    const runtime = scripted({ claude: [output("hi")] });
    expect(await collect(runtime.headless("claude", {}).stream(REQUEST))).toEqual(["started", "text", "finished"]);
  });

  test("omits the text event when the output text is empty", async () => {
    const runtime = scripted({ claude: [output("")] });
    expect(await collect(runtime.headless("claude", {}).stream(REQUEST))).toEqual(["started", "finished"]);
  });

  test("streams only finished for a scripted failure", async () => {
    const runtime = scripted({ claude: [FAILURE] });
    expect(await collect(runtime.headless("claude", {}).stream(REQUEST))).toEqual(["finished"]);
  });
});

describe("fakeRuntime recorder", () => {
  test("records requests and plans in live arrays", async () => {
    const runtime = scripted({ claude: [output("a")] });
    const requests = runtime.requests;
    const plans = runtime.plans;
    expect(requests).toHaveLength(0);
    const handle = runtime.headless("claude", {});
    const planned = handle.plan(REQUEST);
    expect(planned.ok).toBe(true);
    expect(requests).toHaveLength(1);
    expect(plans).toHaveLength(1);
    expect(plans[0]?.harness).toBe("claude");
    expect(plans[0]?.engine).toBe(Engine.Cli);
    expect(plans[0]?.confinement).toEqual([]);
    await handle.run(REQUEST);
    expect(requests).toHaveLength(2);
    expect(runtime.requests).toBe(requests);
  });
});

describe("fakeRuntime close", () => {
  test("fails runs and plans with runtime-closed once closed", async () => {
    const runtime = scripted({ claude: [output("late")] });
    const handle = runtime.headless("claude", {});
    await runtime.close();
    const run = await handle.run(REQUEST);
    expect(run.ok).toBe(false);
    expect(!run.ok && run.failure.kind === "unavailable" && run.failure.reason).toBe("runtime-closed");
    const planned = handle.plan(REQUEST);
    expect(planned.ok).toBe(false);
    expect(runtime.plans).toHaveLength(0);
    expect(await collect(handle.stream(REQUEST))).toEqual(["finished"]);
  });

  test("disposes through Symbol.asyncDispose", async () => {
    const runtime = scripted({ claude: [output("x")] });
    await runtime[Symbol.asyncDispose]();
    const run = await runtime.headless("claude", {}).run(REQUEST);
    expect(run.ok).toBe(false);
  });
});

describe("fakeRuntime type surface", () => {
  test("is assignable to the headless and close slice of Runtime", () => {
    const slice: Pick<Runtime, "headless" | "close"> = scripted({});
    expect(typeof slice.close).toBe("function");
  });
});

describe("fakeRuntime calls", () => {
  test("records the id, the options and the request of each call", async () => {
    const runtime = scripted({ claude: [output("a")] });
    const handle = runtime.headless("claude", { tools: TOOLS_OFF });
    await handle.run(REQUEST);
    expect(runtime.calls).toHaveLength(1);
    expect(runtime.calls[0]?.id).toBe("claude");
    expect(runtime.calls[0]?.options.tools).toEqual(TOOLS_OFF);
    expect(runtime.calls[0]?.request).toBe(REQUEST);
  });

  test("records an empty options object when none were passed", () => {
    const runtime = scripted({});
    runtime.headless("codex").plan(REQUEST);
    expect(runtime.calls[0]?.options).toEqual({});
  });
});

describe("fakeOutput", () => {
  test("defaults every field and lets an override win", () => {
    const made = fakeOutput({ text: "hi", model: "m" });
    expect(made.text).toBe("hi");
    expect(made.model).toBe("m");
    expect(made.usage).toEqual(NO_USAGE);
    expect(made.cost).toEqual({ usd: 0, basis: "list" });
    expect(made.confinement).toEqual([]);
    expect(made.cwd).toBe("/fake-cwd");
    expect(made.engine).toBe(Engine.Cli);
  });

  test("with no override gives empty text", () => {
    expect(fakeOutput().text).toBe("");
  });
});

describe("fakeRuntime promptLimit and capabilities", () => {
  test("default to the real built-in values", async () => {
    const runtime = scripted({});
    const real = createRuntime();
    for (const id of ["claude", "codex", "opencode"] as const) {
      expect(runtime.promptLimit(id)).toBe(real.promptLimit(id));
      expect(runtime.promptLimit(id, Engine.Sdk)).toBe(real.promptLimit(id, Engine.Sdk));
      expect(runtime.capabilities(id)).toEqual(real.capabilities(id));
    }
    await real.close();
    expect(runtime.promptLimit("claude")).not.toBeNull();
    expect(runtime.promptLimit("codex")).toBeNull();
  });

  test("an override wins, including a null limit", async () => {
    const real = createRuntime();
    const caps = real.capabilities("codex");
    await real.close();
    const runtime = fakeRuntime({ scripts: {}, promptLimits: { claude: null, codex: 7 }, capabilities: caps === null ? {} : { claude: caps } });
    expect(runtime.promptLimit("claude")).toBeNull();
    expect(runtime.promptLimit("codex")).toBe(7);
    expect(runtime.capabilities("claude")?.[CapabilityName.ClosedEnv]).toEqual(caps?.[CapabilityName.ClosedEnv]);
  });
});
