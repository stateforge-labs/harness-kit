import { describe, expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import { fail, ok } from "../../src/core/result.ts";
import { secret } from "../../src/core/secret.ts";
import type { Clock } from "../../src/core/io.ts";
import type { ProcessRunner, ProcessSpec } from "../../src/driver/ports.ts";
import { createRuntime } from "../../src/runtime/index.ts";
import { fakeClock } from "../support/fakes.ts";
import { fixture, sourceOf, binFs } from "../runtime/support.ts";

const CREDENTIAL = { mode: "api-key", key: secret("sk-RUN-CLEANUP"), provider: "openai" };
const TEXT_ONLY = '{"type":"text","part":{"text":"hello"}}\n';
const WITH_SESSION = '{"type":"text","sessionID":"ses_known","part":{"text":"hello"}}\n';
const SETTLE_MS = 3000;
const SPIN_LIMIT = 500;

interface Script {
  readonly runOut: string;
  readonly runCode?: number;
  readonly lists?: (title: string) => readonly (readonly { id: string; title: string }[])[];
  readonly failSessionSpawns?: boolean;
}

function stream(text: string): AsyncGenerator<Uint8Array> {
  async function* body(): AsyncGenerator<Uint8Array> {
    if (text !== "") {
      yield Buffer.from(text);
    }
  }
  return body();
}

function rigFor(script: Script) {
  const specs: ProcessSpec[] = [];
  const waits: number[] = [];
  const base = fakeClock(0);
  const clock: Clock & { advance(ms: number): void } = {
    now: base.now,
    advance: base.advance,
    after(ms, fn) {
      waits.push(ms);
      return base.after(ms, fn);
    },
  };
  let listed = 0;
  let title = "";
  const runner: ProcessRunner = async (spec) => {
    specs.push(spec);
    const sub = spec.args[0] === "session" ? spec.args[1] : null;
    title = spec.args.includes("--title") ? (spec.args[spec.args.indexOf("--title") + 1] ?? "") : title;
    const lists = script.lists === undefined ? [] : script.lists(title);
    if (sub !== null && script.failSessionSpawns === true) {
      return fail({ code: "spawn-failed", message: "no" });
    }
    const out = spec.args.includes("--version")
      ? "1.0.0\n"
      : spec.args.includes("--help")
        ? fixture("opencode", "help.txt")
        : sub === "list"
          ? JSON.stringify(lists[Math.min(listed++, lists.length - 1)] ?? [])
          : sub === "delete"
            ? ""
            : script.runOut;
    const code = sub === null && !spec.args.includes("--version") && !spec.args.includes("--help") ? (script.runCode ?? 0) : 0;
    return ok({ pid: null, stdout: stream(out), stderr: stream(""), exited: Promise.resolve({ code, signal: null }), signalGroup() {} });
  };
  const runtime = createRuntime({
    source: sourceOf(),
    spawn: runner,
    fs: binFs(["opencode"]),
    clock,
    platform: "linux",
    cwd: () => "/work",
  });
  const handle = runtime.headless("opencode", { credential: CREDENTIAL } as never);
  return { specs, waits, clock, handle };
}

async function settleWith<T>(work: Promise<T>, clock: { advance(ms: number): void }, waits: readonly number[], want: number): Promise<T> {
  let done = false;
  const guarded = work.finally(() => {
    done = true;
  });
  for (let spin = 0; spin < SPIN_LIMIT && !done; spin += 1) {
    if (waits.length >= want && waits.includes(SETTLE_MS)) {
      clock.advance(SETTLE_MS);
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  return guarded;
}

function verbs(specs: readonly ProcessSpec[]): string[] {
  return specs
    .filter((spec) => spec.args[0] === "session" || spec.args.includes("--title"))
    .map((spec) => (spec.args[0] !== "session" ? "run" : spec.args[1] === "delete" ? `delete ${spec.args.at(-1)}` : "list"));
}

const REQUEST = { instructions: "x", input: "y" };

describe("opencode residue cleanup through the runtime", () => {
  test("a known session is deleted and the clock is never asked to wait", async () => {
    const r = rigFor({ runOut: WITH_SESSION });
    const result = await r.handle.run(REQUEST);
    expect(result.ok).toBe(true);
    expect(verbs(r.specs)).toEqual(["run", "delete ses_known"]);
    expect(r.waits.includes(SETTLE_MS)).toBe(false);
  });

  test("an unknown session lists, deletes matches only, waits 3000 through the clock, lists and deletes again", async () => {
    const r = rigFor({
      runOut: TEXT_ONLY,
      lists: (title) => [
        [
          { id: "a", title },
          { id: "b", title },
          { id: "other", title: "mine" },
        ],
        [{ id: "c", title }],
      ],
    });
    const result = await settleWith(r.handle.run(REQUEST), r.clock, r.waits, 1);
    expect(result.ok).toBe(true);
    expect(verbs(r.specs)).toEqual(["run", "list", "delete a", "delete b", "list", "delete c"]);
    expect(r.waits.filter((ms) => ms === SETTLE_MS)).toEqual([SETTLE_MS]);
    expect(r.specs.some((spec) => spec.args.includes("other"))).toBe(false);
  });

  test("a failing session spawn leaves the run result untouched", async () => {
    const r = rigFor({ runOut: TEXT_ONLY, failSessionSpawns: true });
    const result = await settleWith(r.handle.run(REQUEST), r.clock, r.waits, 1);
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.text).toBe("hello");
  });

  test("a run that exits non-zero is still cleaned up and keeps its failure", async () => {
    const r = rigFor({ runOut: TEXT_ONLY, runCode: 1 });
    const result = await settleWith(r.handle.run(REQUEST), r.clock, r.waits, 1);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.failure.kind).toBe("exit");
    expect(verbs(r.specs)).toEqual(["run", "list", "list"]);
  });

  test("two runs on one runtime carry different titles", async () => {
    const r = rigFor({ runOut: WITH_SESSION });
    await r.handle.run(REQUEST);
    await r.handle.run(REQUEST);
    const titles = r.specs.filter((spec) => spec.args.includes("--title")).map((spec) => spec.args[spec.args.indexOf("--title") + 1]);
    expect(titles).toHaveLength(2);
    expect(new Set(titles).size).toBe(2);
  });
});
