import { describe, expect, test } from "bun:test";
import type { Runtime } from "../../src/driver/create-runtime.ts";
import { fakeRuntime, type FakeRuntime, type FakeScripts } from "../../src/testing/fake-runtime.ts";
import { Engine } from "../../src/core/capability.ts";
import type { RunFailure } from "../../src/core/failure.ts";
import { Hermetic, Isolation, type RunOutput, type RunRequest } from "../../src/core/run.ts";
import { NO_USAGE } from "../../src/core/kit.ts";

const REQUEST: RunRequest = { instructions: "do", input: "work" };

function output(text: string): RunOutput {
  return {
    text,
    usage: NO_USAGE,
    cost: { usd: null, basis: "unavailable" },
    model: null,
    sessionId: null,
    engine: Engine.Cli,
    stability: "stable",
    elapsedMs: 0,
    hermetic: Hermetic.None,
    persisted: true,
    isolationDir: null,
    binary: { path: "/bin/fake", version: null, source: "installed" },
    cwd: "/work",
    credential: { requested: "api-key", observed: null, verified: false, scrubbed: [], billing: "unverified", acknowledgement: null },
  };
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

  test("reports script-exhausted once a harness runs out", async () => {
    const runtime = scripted({ claude: [output("only")] });
    const handle = runtime.headless("claude", {});
    await handle.run(REQUEST);
    const result = await handle.run(REQUEST);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.failure).toEqual({ kind: "unavailable", message: "claude: fake runtime script exhausted", reason: "script-exhausted" });
  });

  test("reports script-exhausted for a harness with no script", async () => {
    const result = await scripted({}).headless("opencode", {}).run(REQUEST);
    expect(!result.ok && result.failure.kind).toBe("unavailable");
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
    expect(plans[0]?.isolation).toEqual({ kind: Isolation.None });
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
