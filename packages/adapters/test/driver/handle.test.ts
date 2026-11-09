import { describe, expect, test } from "bun:test";
import type { RuntimeContext } from "../../src/driver/context.ts";
import { makeHandle } from "../../src/driver/handle.ts";
import type { ProcessRunner, ProcessSpec } from "../../src/driver/ports.ts";
import type { HeadlessOptions, LibraryEvent, RunEvent, RunOutput, RunRequest } from "../../src/core/run.ts";
import type { RunFailure } from "../../src/core/failure.ts";
import { ECHO_PREFIX, echoDriver, FAKE_CAPABILITIES, FAKE_INJECT, FAKE_STRIP } from "../support/fake-driver.ts";
import { chunkedRunner, type ChunkScript } from "../support/chunked-runner.ts";
import { options, request } from "../support/prepare.ts";
import { SENTINEL } from "../support/credential.ts";
import { fakeFs, type FakeFs } from "../support/fakes.ts";
import { BIN_PATH, RUN_CWD, runtimeCtx, SCRATCH_FIRST, fsWithBinary } from "../support/runtime.ts";
import { HELP_ARGS, HELP_TEXT, NOTICE, driverWith } from "../support/variants.ts";
import { type HarnessDriver } from "../../src/driver/port.ts";
import { fail, ok, type Result } from "../../src/core/result.ts";
import { CapabilityName, cell, Engine, UnsupportedReason, unsupported } from "../../src/core/capability.ts";
import { policyFailure } from "../../src/core/credential-plan.ts";
import { DEFAULT_LIMITS, OUT_FILE_NAME } from "../../src/driver/constants.ts";
import { unparsable } from "../../src/core/kit.ts";

const VERSION: ChunkScript = { chunks: ["fake-cli 1.2.3\n"] };
const TEXT: ChunkScript = { chunks: ["text:hel", "lo\ntext:", " world\n"] };
const OUT_PATH = `${SCRATCH_FIRST}/${OUT_FILE_NAME}`;
const CWD_DIR = "/tmp/stateforge-adapters-cwd-1";
const HOME_VALUE = "/h/u";
const ALLOWED_FIELDS: Readonly<Record<string, readonly string[]>> = {
  spawn: ["kind", "harness", "engine", "purpose", "argc"],
  exit: ["kind", "harness", "purpose", "code", "signal", "durationMs", "outcome"],
  "credential-plan": ["kind", "harness", "mode", "injected", "stripped"],
  "engine-selected": ["kind", "harness", "engine"],
  "cwd-created": ["kind", "harness", "retain"],
  "cwd-removed": ["kind", "harness", "retain"],
};

async function collect(events: AsyncIterable<RunEvent>): Promise<RunEvent[]> {
  const out: RunEvent[] = [];
  for await (const event of events) {
    out.push(event);
  }
  return out;
}

function finishedOf(events: readonly RunEvent[]): Result<RunOutput, RunFailure> {
  const last = events.at(-1);
  if (last === undefined || last.kind !== "finished") {
    throw new Error("stream did not end with finished");
  }
  return last.result;
}

function failureOf(result: Result<RunOutput, RunFailure>): RunFailure {
  if (result.ok) {
    throw new Error("expected a failure");
  }
  return result.failure;
}

function outputOf(result: Result<RunOutput, RunFailure>): RunOutput {
  if (!result.ok) {
    throw new Error(`expected output, got ${result.failure.kind}`);
  }
  return result.value;
}

function harness(opts: Partial<HeadlessOptions<"fake">> = {}, driver: HarnessDriver<"fake"> | null = echoDriver()) {
  return { driver, opts: options(opts) };
}

describe("plan", () => {
  test("performs no I/O, emits no events and exposes no secret", () => {
    const events: LibraryEvent[] = [];
    const chunked = chunkedRunner([]);
    const { ctx } = runtimeCtx({ runner: chunked.runner, onEvent: (event) => events.push(event) });
    const handle = makeHandle(ctx, echoDriver(), "fake", options());
    const planned = handle.plan(request());
    expect(planned.ok).toBe(true);
    expect(chunked.specs).toEqual([]);
    expect(events).toEqual([]);
    expect(JSON.stringify(planned)).not.toContain(SENTINEL);
  });

  test("reports unknown-harness when no driver is registered", () => {
    const { ctx } = runtimeCtx();
    const planned = makeHandle(ctx, null, "fake", options()).plan(request());
    expect(planned.ok).toBe(false);
    expect(failureOf(planned as Result<never, RunFailure>).kind).toBe("unknown-harness");
  });

  test("fails with runtime-closed once the runtime is closed", () => {
    const { ctx } = runtimeCtx();
    ctx.state.closed = true;
    const planned = makeHandle(ctx, echoDriver(), "fake", options()).plan(request());
    expect(planned.ok).toBe(false);
  });
});

describe("run and stream", () => {
  test("run returns the text, binary and evidence from a successful run", async () => {
    const chunked = chunkedRunner([VERSION, TEXT]);
    const { ctx } = runtimeCtx({ runner: chunked.runner });
    const output = outputOf(await makeHandle(ctx, echoDriver(), "fake", options()).run(request()));
    expect(output.text).toBe("hello world");
    expect(output.binary).toEqual({ path: BIN_PATH, version: "1.2.3", source: "installed" });
    expect(output.engine).toBe("cli");
    expect(output.stability).toBe("stable");
    expect(output.cwd).toBe(RUN_CWD);
    expect(Object.keys(output.credential).sort()).toEqual(["acknowledgement", "billing", "requested", "scrubbed"]);
  });

  test("probe specs carry no credential and the run spec carries it only in env", async () => {
    const chunked = chunkedRunner([VERSION, TEXT]);
    const { ctx } = runtimeCtx({ runner: chunked.runner });
    await makeHandle(ctx, echoDriver(), "fake", options()).run(request());
    const [probe, run] = chunked.specs as [ProcessSpec, ProcessSpec];
    expect(probe.args).toEqual(["--version"]);
    expect(JSON.stringify(probe)).not.toContain(SENTINEL);
    expect(probe.env[FAKE_INJECT]).toBeUndefined();
    expect(JSON.stringify(run.args)).not.toContain(SENTINEL);
    expect(JSON.stringify(run.stdin)).not.toContain(SENTINEL);
    expect(run.env[FAKE_INJECT]).toBe(SENTINEL);
  });

  test("stream yields started, streamed text once, then finished", async () => {
    const chunked = chunkedRunner([VERSION, TEXT]);
    const { ctx } = runtimeCtx({ runner: chunked.runner });
    const events = await collect(makeHandle(ctx, echoDriver(), "fake", options()).stream(request()));
    expect(events.map((event) => event.kind)).toEqual(["started", "text", "text", "finished"]);
    const texts = events.flatMap((event) => (event.kind === "text" ? [event.text] : []));
    expect(texts.join("")).toBe("hello world");
    expect(outputOf(finishedOf(events)).text).toBe("hello world");
  });

  test("final text is emitted once when nothing was streamed", async () => {
    const chunked = chunkedRunner([VERSION, { chunks: ["plain line\n"] }]);
    const fs = fsWithBinary({ files: { [`${SCRATCH_FIRST}/last-message.txt`]: "from file" } });
    const { ctx } = runtimeCtx({ runner: chunked.runner, fsOverride: fs });
    const events = await collect(makeHandle(ctx, echoDriver(), "fake", options()).stream(request()));
    expect(events.map((event) => event.kind)).toEqual(["started", "text", "finished"]);
    expect(events.flatMap((event) => (event.kind === "text" ? [event.text] : []))).toEqual(["from file"]);
  });

  test("a secret split across stdout chunks is masked in streamed text", async () => {
    const chunked = chunkedRunner([VERSION, { chunks: [`${ECHO_PREFIX}sk-SEN`, "TINEL-7f3a9c\n"] }]);
    const { ctx } = runtimeCtx({ runner: chunked.runner });
    const events = await collect(makeHandle(ctx, echoDriver(), "fake", options()).stream(request()));
    expect(events.flatMap((event) => (event.kind === "text" ? [event.text] : []))).toEqual(["[redacted]"]);
    expect(JSON.stringify(events)).not.toContain(SENTINEL);
  });

  test("unrecognised payloads are passed through the redactor", async () => {
    const chunked = chunkedRunner([VERSION, { chunks: ["odd\n"] }]);
    const { ctx } = runtimeCtx({ runner: chunked.runner });
    const events = await collect(makeHandle(ctx, echoDriver(), "fake", options()).stream(request()));
    expect(events.map((event) => event.kind)).toEqual(["started", "unrecognised", "finished"]);
  });

  test("the probe is cached per binary path across runs", async () => {
    const chunked = chunkedRunner([VERSION, TEXT, TEXT]);
    const { ctx } = runtimeCtx({ runner: chunked.runner });
    const handle = makeHandle(ctx, echoDriver(), "fake", options());
    await handle.run(request());
    await handle.run(request());
    expect(chunked.specs.length).toBe(3);
  });

  test("the lifecycle events carry names and counts only", async () => {
    const chunked = chunkedRunner([VERSION, TEXT]);
    const events: LibraryEvent[] = [];
    const { ctx } = runtimeCtx({ runner: chunked.runner, onEvent: (event) => events.push(event) });
    await makeHandle(ctx, echoDriver(), "fake", options()).run(request());
    const kinds = events.map((event) => event.kind);
    expect(kinds).toEqual(["engine-selected", "credential-plan", "spawn", "exit", "spawn", "exit"]);
    expect(JSON.stringify(events)).not.toContain(SENTINEL);
    const plan = events.find((event) => event.kind === "credential-plan");
    expect(plan).toMatchObject({ kind: "credential-plan", injected: [FAKE_INJECT] });
  });

  test("a throwing or rejecting onEvent does not break the run", async () => {
    const chunked = chunkedRunner([VERSION, TEXT]);
    const { ctx } = runtimeCtx({
      runner: chunked.runner,
      onEvent: async () => {
        throw new Error("rejected");
      },
    });
    const output = await makeHandle(ctx, echoDriver(), "fake", options()).run(request());
    expect(outputOf(output).text).toBe("hello world");
  });

  test("run is tracked in flight and settles to zero", async () => {
    const chunked = chunkedRunner([VERSION, TEXT]);
    const { ctx } = runtimeCtx({ runner: chunked.runner });
    await makeHandle(ctx, echoDriver(), "fake", options()).run(request());
    expect(ctx.state.inflight.size).toBe(0);
  });
});

describe("failures before spawn", () => {
  test("a pre-aborted signal aborts without spawning", async () => {
    const chunked = chunkedRunner([VERSION]);
    const { ctx } = runtimeCtx({ runner: chunked.runner });
    const controller = new AbortController();
    controller.abort();
    const result = await makeHandle(ctx, echoDriver(), "fake", options({ signal: controller.signal })).run(request());
    expect(failureOf(result).kind).toBe("aborted");
    expect(chunked.specs).toEqual([]);
  });

  test("a missing binary is binary-missing and spawns nothing", async () => {
    const chunked = chunkedRunner([VERSION]);
    const { ctx } = runtimeCtx({ runner: chunked.runner, fsOverride: fakeFs({}) });
    const failure = failureOf(await makeHandle(ctx, echoDriver(), "fake", options()).run(request()));
    expect(failure).toMatchObject({ kind: "unavailable", reason: "binary-missing" });
    expect(chunked.specs).toEqual([]);
  });

  test("an oversized argv is too-large and spawns nothing", async () => {
    const chunked = chunkedRunner([VERSION]);
    const { ctx } = runtimeCtx({ runner: chunked.runner });
    const big = request({ instructions: "x".repeat(5000) });
    const failure = failureOf(await makeHandle(ctx, echoDriver(), "fake", options()).run(big));
    expect(failure.kind).toBe("too-large");
    expect(chunked.specs).toEqual([]);
  });

  test("an unsupported credential mode fails before any spawn", async () => {
    const chunked = chunkedRunner([VERSION]);
    const { ctx } = runtimeCtx({ runner: chunked.runner });
    const failure = failureOf(await makeHandle(ctx, echoDriver(), "fake", options({ credential: { mode: "login-store" } })).run(request()));
    expect(failure.kind).toBe("credential-unsupported");
    expect(chunked.specs).toEqual([]);
  });

  test("the version probe never refuses a run, whatever version it reports", async () => {
    const chunked = chunkedRunner([{ chunks: ["fake-cli 9.9.9\n"] }, TEXT]);
    const { ctx } = runtimeCtx({ runner: chunked.runner });
    const output = outputOf(await makeHandle(ctx, echoDriver(), "fake", options()).run(request()));
    expect(output.binary.version).toBe("9.9.9");
    expect(chunked.specs.length).toBe(2);
  });

  test("a throwing env transform is invalid-config on field env", async () => {
    const chunked = chunkedRunner([VERSION]);
    const { ctx } = runtimeCtx({
      runner: chunked.runner,
      envTransform: () => {
        throw new Error("nope");
      },
    });
    const failure = failureOf(await makeHandle(ctx, echoDriver(), "fake", options()).run(request()));
    expect(failure).toMatchObject({ kind: "invalid-config", field: "env" });
    expect(chunked.specs).toEqual([]);
  });

  test("a non-object env transform result is invalid-config", async () => {
    const { ctx } = runtimeCtx({ envTransform: () => "nope" as unknown as Record<string, string> });
    const failure = failureOf(await makeHandle(ctx, echoDriver(), "fake", options()).run(request()));
    expect(failure.kind).toBe("invalid-config");
  });

  test("the env transform works on a per-run copy and never mutates the runtime source", async () => {
    const chunked = chunkedRunner([VERSION, TEXT]);
    const { ctx } = runtimeCtx({
      runner: chunked.runner,
      envTransform: (base) => ({ ...base, LEAK: "1" }),
    });
    await makeHandle(ctx, echoDriver(), "fake", options()).run(request());
    expect(ctx.source.LEAK).toBeUndefined();
    expect(chunked.specs[1]?.env.LEAK).toBe("1");
  });

  test("a closed runtime refuses run and stream", async () => {
    const chunked = chunkedRunner([VERSION]);
    const { ctx } = runtimeCtx({ runner: chunked.runner });
    ctx.state.closed = true;
    const handle = makeHandle(ctx, echoDriver(), "fake", options());
    expect(failureOf(await handle.run(request()))).toMatchObject({ kind: "unavailable", reason: "runtime-closed" });
    expect(finishedOf(await collect(handle.stream(request()))).ok).toBe(false);
    expect(chunked.specs).toEqual([]);
  });

  test("an unknown driver is unknown-harness", async () => {
    const { ctx } = runtimeCtx();
    const failure = failureOf(await makeHandle(ctx, null, "fake", options()).run(request()));
    expect(failure.kind).toBe("unknown-harness");
  });
});

describe("failures during the run", () => {
  test("a non-zero exit is an exit failure, and the scratch dir is removed", async () => {
    const chunked = chunkedRunner([VERSION, { chunks: [], code: 2, stderr: "boom" }]);
    const events: LibraryEvent[] = [];
    const { ctx, fs } = runtimeCtx({ runner: chunked.runner, onEvent: (event) => events.push(event) });
    const failure = failureOf(await makeHandle(ctx, echoDriver(), "fake", options()).run(request()));
    expect(failure.kind).toBe("exit");
    expect(fs.removed).toContain(SCRATCH_FIRST);
    expect(events).toContainEqual(expect.objectContaining({ kind: "exit", outcome: "exit", code: null }));
  });

  test("breaking out of the stream early still removes the scratch dir", async () => {
    const chunked = chunkedRunner([VERSION, TEXT]);
    const { ctx, fs } = runtimeCtx({ runner: chunked.runner });
    for await (const event of makeHandle(ctx, echoDriver(), "fake", options()).stream(request())) {
      expect(event.kind).toBe("started");
      break;
    }
    expect(fs.removed).toContain(SCRATCH_FIRST);
  });

  test("a throwing spawn is an internal-error via the stream guard", async () => {
    const base = chunkedRunner([VERSION]);
    const runner: ProcessRunner = async (spec) => {
      if (base.specs.length >= 1) {
        throw Object.assign(new Error("boom"), { name: "BoomError" });
      }
      return base.runner(spec);
    };
    const { ctx } = runtimeCtx({ runner });
    const failure = failureOf(await makeHandle(ctx, echoDriver(), "fake", options()).run(request()));
    expect(failure).toMatchObject({ kind: "unavailable", reason: "internal-error" });
  });
});

describe("private cwd", () => {
  test("retain delete removes the private cwd and reports it", async () => {
    const chunked = chunkedRunner([VERSION, TEXT]);
    const events: LibraryEvent[] = [];
    const { ctx, fs } = runtimeCtx({ runner: chunked.runner, onEvent: (event) => events.push(event) });
    const output = outputOf(await makeHandle(ctx, echoDriver(), "fake", options({ cwd: { private: "delete" } })).run(request()));
    expect(output.cwd).toBe(CWD_DIR);
    expect(fs.removed).toContain(CWD_DIR);
    expect(events.map((event) => event.kind)).toContain("cwd-removed");
  });

  test("retain keep returns the private cwd and leaves it on disk", async () => {
    const chunked = chunkedRunner([VERSION, TEXT]);
    const { ctx, fs } = runtimeCtx({ runner: chunked.runner });
    const output = outputOf(await makeHandle(ctx, echoDriver(), "fake", options({ cwd: { private: "keep" } })).run(request()));
    expect(output.cwd).toBe(CWD_DIR);
    expect(fs.removed).not.toContain(CWD_DIR);
  });
});

describe("plan options precedence", () => {
  function optionsOf(opts: Partial<HeadlessOptions<"fake">>, req: Partial<RunRequest>) {
    const { ctx } = runtimeCtx();
    const planned = makeHandle(ctx, echoDriver(), "fake", options(opts)).plan(request(req));
    if (!planned.ok) {
      throw new Error(`expected a plan, got ${planned.failure.kind}`);
    }
    return planned.value.options;
  }

  test("fields with no value take the fact", () => {
    expect(optionsOf({}, {})).toMatchObject({ model: null, effort: null, persist: true });
  });

  test("a value on the handle is used", () => {
    expect(optionsOf({ model: "consumer-model" }, {})).toMatchObject({ model: "consumer-model" });
    expect(optionsOf({ effort: "low" }, {})).toMatchObject({ effort: "low" });
    expect(optionsOf({ cwd: "/elsewhere" }, {})).toMatchObject({ cwd: "/elsewhere" });
  });

  test("a value on the request wins over the handle", () => {
    expect(optionsOf({ model: "consumer-model" }, { model: "call-model" })).toMatchObject({ model: "call-model" });
    expect(optionsOf({}, { effort: "low" })).toMatchObject({ effort: "low" });
  });
});

describe("pre-spawn order, further cases", () => {
  test("a missing credential acknowledgement fails before the binary lookup and spawns nothing", async () => {
    const chunked = chunkedRunner([VERSION]);
    const driver = driverWith({ credentials: { plan: () => fail(policyFailure(NOTICE)) } });
    const { ctx } = runtimeCtx({ runner: chunked.runner, fsOverride: fakeFs({}) });
    const failure = failureOf(await makeHandle(ctx, driver, "fake", options()).run(request()));
    expect(failure.kind).toBe("policy-not-acknowledged");
    expect(chunked.specs).toEqual([]);
  });

  test("an unsupported effort fails before the binary lookup and spawns nothing", async () => {
    const chunked = chunkedRunner([VERSION]);
    const driver = driverWith({
      capabilities: { ...FAKE_CAPABILITIES, [CapabilityName.Effort]: cell(unsupported(UnsupportedReason.NotImplemented)) },
    });
    const { ctx } = runtimeCtx({ runner: chunked.runner, fsOverride: fakeFs({}) });
    const failure = failureOf(await makeHandle(ctx, driver, "fake", options()).run(request({ effort: "high" })));
    expect(failure.kind).toBe("unsupported");
    expect(chunked.specs).toEqual([]);
  });
});

describe("help preflight", () => {
  test("runs once per binary path with the probe env and purpose help, then checkHelp on every run", async () => {
    const seen: string[] = [];
    const driver = driverWith({
      cli: {
        helpArgs: HELP_ARGS,
        checkHelp: (help) => {
          seen.push(help);
          return ok(null);
        },
      },
    });
    const chunked = chunkedRunner([VERSION, { chunks: [HELP_TEXT] }, TEXT, TEXT]);
    const events: LibraryEvent[] = [];
    const { ctx } = runtimeCtx({ runner: chunked.runner, onEvent: (event) => events.push(event) });
    const handle = makeHandle(ctx, driver, "fake", options());
    expect(outputOf(await handle.run(request())).text).toBe("hello world");
    expect(outputOf(await handle.run(request())).text).toBe("hello world");
    expect(chunked.specs.map((spec) => spec.args[0])).toEqual(["--version", "--help", "run", "run"]);
    expect(seen).toEqual([HELP_TEXT, HELP_TEXT]);
    const help = chunked.specs[1];
    expect(help?.env[FAKE_STRIP]).toBeUndefined();
    expect(help?.env[FAKE_INJECT]).toBeUndefined();
    expect(JSON.stringify(help)).not.toContain(SENTINEL);
    expect(events.filter((event) => event.kind === "spawn" && event.purpose === "help")).toHaveLength(1);
  });

  test("a checkHelp rejection stops the run before the run spawn", async () => {
    const rejected: RunFailure = { kind: "unparsable", message: "no help", reason: "help" };
    const driver = driverWith({ cli: { helpArgs: HELP_ARGS, checkHelp: () => fail(rejected) } });
    const chunked = chunkedRunner([VERSION, { chunks: [HELP_TEXT] }]);
    const { ctx } = runtimeCtx({ runner: chunked.runner });
    const failure = failureOf(await makeHandle(ctx, driver, "fake", options()).run(request()));
    expect(failure).toEqual(rejected);
    expect(chunked.specs.map((spec) => spec.args[0])).toEqual(["--version", "--help"]);
  });

  test("a help probe that exits non-zero is unavailable and stops the run", async () => {
    const driver = driverWith({ cli: { helpArgs: HELP_ARGS } });
    const chunked = chunkedRunner([VERSION, { chunks: [], code: 1 }]);
    const { ctx } = runtimeCtx({ runner: chunked.runner });
    const failure = failureOf(await makeHandle(ctx, driver, "fake", options()).run(request()));
    expect(failure).toMatchObject({ kind: "unavailable", reason: "spawn-failed" });
    expect(chunked.specs.length).toBe(2);
  });
});

describe("out file", () => {
  test("the out-file text is read through fs.readText with the stdout limit", async () => {
    const base = fsWithBinary({ files: { [OUT_PATH]: "from file" } });
    const reads: [string, number][] = [];
    const fs: FakeFs = {
      ...base,
      readText: async (path, maxBytes) => {
        reads.push([path, maxBytes]);
        return base.readText(path, maxBytes);
      },
    };
    const chunked = chunkedRunner([VERSION, { chunks: ["plain\n"] }]);
    const { ctx } = runtimeCtx({ runner: chunked.runner, fsOverride: fs });
    const output = outputOf(await makeHandle(ctx, echoDriver(), "fake", options()).run(request()));
    expect(output.text).toBe("from file");
    expect(reads).toEqual([[OUT_PATH, DEFAULT_LIMITS.maxStdoutBytes]]);
  });

  test("a throwing out-file read falls back to the streamed text", async () => {
    const base = fsWithBinary();
    const fs: FakeFs = {
      ...base,
      readText: async () => {
        throw new Error("EIO");
      },
    };
    const chunked = chunkedRunner([VERSION, TEXT]);
    const { ctx } = runtimeCtx({ runner: chunked.runner, fsOverride: fs });
    expect(outputOf(await makeHandle(ctx, echoDriver(), "fake", options()).run(request())).text).toBe("hello world");
  });

  test("the scratch dir is removed after a successful run", async () => {
    const chunked = chunkedRunner([VERSION, TEXT]);
    const { ctx, fs } = runtimeCtx({ runner: chunked.runner });
    await makeHandle(ctx, echoDriver(), "fake", options()).run(request());
    expect(fs.removed).toContain(SCRATCH_FIRST);
  });

  test("the scratch dir is removed when the engine reports a failure event", async () => {
    const chunked = chunkedRunner([VERSION, TEXT]);
    const driver = driverWith({ cli: { parseLine: () => [{ kind: "failure", failure: unparsable("bad output") }] } });
    const { ctx, fs } = runtimeCtx({ runner: chunked.runner });
    expect(failureOf(await makeHandle(ctx, driver, "fake", options()).run(request())).kind).toBe("unparsable");
    expect(fs.removed).toContain(SCRATCH_FIRST);
  });

  test("the scratch dir is removed when parseLine throws, and the throw is an internal-error", async () => {
    const chunked = chunkedRunner([VERSION, TEXT]);
    const driver = driverWith({
      cli: {
        parseLine: () => {
          throw new Error("boom");
        },
      },
    });
    const { ctx, fs } = runtimeCtx({ runner: chunked.runner });
    expect(failureOf(await makeHandle(ctx, driver, "fake", options()).run(request()))).toMatchObject({ kind: "unavailable", reason: "internal-error" });
    expect(fs.removed).toContain(SCRATCH_FIRST);
  });
});

describe("onEvent payloads", () => {
  test("every event has exactly its allowlisted fields and no cwd, home or secret", async () => {
    const chunked = chunkedRunner([VERSION, TEXT]);
    const events: LibraryEvent[] = [];
    const { ctx } = runtimeCtx({ runner: chunked.runner, onEvent: (event) => events.push(event) });
    await makeHandle(ctx, echoDriver(), "fake", options({ cwd: { private: "delete" } })).run(request());
    expect(events.map((event) => event.kind)).toContain("cwd-removed");
    for (const event of events) {
      expect(Object.keys(event).sort()).toEqual([...(ALLOWED_FIELDS[event.kind] ?? [])].sort());
    }
    const json = JSON.stringify(events);
    for (const forbidden of [SENTINEL, CWD_DIR, RUN_CWD, HOME_VALUE]) {
      expect(json).not.toContain(forbidden);
    }
  });

  test("a synchronously throwing onEvent does not break the run", async () => {
    const chunked = chunkedRunner([VERSION, TEXT]);
    const { ctx } = runtimeCtx({
      runner: chunked.runner,
      onEvent: () => {
        throw new Error("sync");
      },
    });
    expect(outputOf(await makeHandle(ctx, echoDriver(), "fake", options()).run(request())).text).toBe("hello world");
  });
});

describe("private cwd under concurrency", () => {
  test("two concurrent runs with a private cwd get distinct dirs, each used as its own cwd", async () => {
    const chunked = chunkedRunner([VERSION, TEXT, TEXT]);
    const { ctx } = runtimeCtx({ runner: chunked.runner });
    const handle = makeHandle(ctx, echoDriver(), "fake", options({ cwd: { private: "keep" } }));
    const [first, second] = await Promise.all([handle.run(request()), handle.run(request())]);
    const dirA = outputOf(first).cwd;
    const dirB = outputOf(second).cwd;
    expect(dirA).not.toBe(dirB);
    expect(dirA.startsWith("/tmp/stateforge-adapters-cwd-")).toBe(true);
    expect(dirB.startsWith("/tmp/stateforge-adapters-cwd-")).toBe(true);
  });
});
