import { describe, expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import { ok } from "../../src/core/result.ts";
import type { CleanupContext } from "../../src/driver/port.ts";
import type { ProcessRunner, ProcessSpec } from "../../src/driver/ports.ts";
import { opencodeCli } from "../../src/opencode/engines/cli.ts";
import { removeResidue } from "../../src/opencode/engines/cleanup.ts";
import { chunkedRunner } from "../support/chunked-runner.ts";
import { ioWith, runInput } from "../support/interpret.ts";
import { fakeClock, fakeFs } from "../support/fakes.ts";

const TITLED = (id: string, title: string) => ({ id, title, updated: 1, created: 1, projectId: "p", directory: "/work" });
const SECRET = "sk-LEAK-CHECK";

interface Rig {
  readonly specs: ProcessSpec[];
  readonly sleeps: number[];
  readonly ctx: CleanupContext;
}

function rig(lists: readonly (readonly unknown[])[], env: Record<string, string> = { HOME: "/h", KEY: SECRET }): Rig {
  const specs: ProcessSpec[] = [];
  const sleeps: number[] = [];
  let listed = 0;
  const runner: ProcessRunner = async (spec) => {
    specs.push(spec);
    const isList = spec.args[1] === "list";
    const out = isList ? JSON.stringify(lists[Math.min(listed++, lists.length - 1)] ?? []) : "";
    async function* stdout(): AsyncGenerator<Uint8Array> {
      yield Buffer.from(out);
    }
    async function* stderr(): AsyncGenerator<Uint8Array> {}
    return ok({ pid: null, stdout: stdout(), stderr: stderr(), exited: Promise.resolve({ code: 0, signal: null }), signalGroup() {} });
  };
  const io = {
    runner,
    clock: fakeClock(0),
    fs: fakeFs({}),
    sleep: (ms: number) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
  };
  const input = runInput({ env, redact: (text) => text.replaceAll(SECRET, "[redacted]") });
  return { specs, sleeps, ctx: { input, stdoutTail: "", io } };
}

describe("opencode residue cleanup", () => {
  test("a known session is deleted directly and nothing waits", async () => {
    const r = rig([]);
    await removeResidue(r.ctx, "headless", "ses_1");
    expect(r.specs.map((spec) => spec.args)).toEqual([["session", "delete", "ses_1"]]);
    expect(r.sleeps).toEqual([]);
  });

  test("without a session it lists, deletes the titled match, waits 3 s, lists again and deletes again", async () => {
    const r = rig([[TITLED("ses_a", "headless"), TITLED("ses_other", "mine")], [TITLED("ses_b", "headless")]]);
    await removeResidue(r.ctx, "headless", null);
    expect(r.specs.map((spec) => spec.args.slice(0, 3).join(" "))).toEqual([
      "session list --format",
      "session delete ses_a",
      "session list --format",
      "session delete ses_b",
    ]);
    expect(r.sleeps).toEqual([3000]);
  });

  test("a failing list ends that pass without throwing and the settle wait still happens", async () => {
    const r = rig([]);
    const failing: CleanupContext = { ...r.ctx, io: { ...r.ctx.io, runner: () => Promise.resolve({ ok: false, failure: { code: "spawn-failed", message: "x" } }) } };
    await removeResidue(failing, "headless", null);
    expect(r.specs).toEqual([]);
    expect(r.sleeps).toEqual([3000]);
  });

  test("the cleanup commands never carry a secret in their environment", async () => {
    const r = rig([], { HOME: "/h", KEY: SECRET, PLAIN: "value" });
    await removeResidue(r.ctx, "headless", "ses_1");
    expect(r.specs[0]?.env).toEqual({ HOME: "/h", PLAIN: "value" });
  });

  test("the engine deletes the session it saw in the stream after the run", async () => {
    const specs: ProcessSpec[] = [];
    const scripted = chunkedRunner([{ chunks: ['{"type":"text","sessionID":"ses_seen","part":{"text":"ok"}}\n'] }, { chunks: [] }]);
    const runner: ProcessRunner = (spec) => {
      specs.push(spec);
      return scripted.runner(spec);
    };
    const run = opencodeCli.start(runInput(), ioWith(runner));
    for await (const event of run.events) {
      void event;
    }
    expect((await run.done).ok).toBe(true);
    expect(specs.map((spec) => spec.args)).toEqual([[], ["session", "delete", "ses_seen"]]);
  });
});
