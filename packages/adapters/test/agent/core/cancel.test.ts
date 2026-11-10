import { describe, expect, test } from "bun:test";
import { agentOf, collect, failureOf, finishedOf, options, rig, startOf } from "./support.ts";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 5));

describe("cancel", () => {
  test("cancel before the first event settles as cancelled after finished", async () => {
    const r = rig([{ hang: true }]);
    const run = agentOf(r).start(startOf());
    await tick();
    expect(r.engine.starts).toHaveLength(1);
    const seen = collect(run.events);
    await run.cancel();
    const events = await seen;
    expect(events.map((e) => e.kind)).toEqual(["finished"]);
    expect(failureOf(finishedOf(events)).kind).toBe("cancelled");
    expect(failureOf(await run.settled).kind).toBe("cancelled");
    expect(r.engine.cancels).toEqual([0]);
    expect(r.engine.starts[0]?.signal.aborted).toBe(true);
  });

  test("cancel right after start, before the engine starts, never starts it", async () => {
    const r = rig([{ hang: true }]);
    const run = agentOf(r).start(startOf());
    await run.cancel();
    expect(failureOf(await run.settled).kind).toBe("cancelled");
    expect(r.engine.starts).toHaveLength(0);
    expect(failureOf(finishedOf(await collect(run.events))).kind).toBe("cancelled");
  });

  test("cancel stays pending until the engine has settled", async () => {
    const r = rig([{ hang: true, hold: true }]);
    const run = agentOf(r).start(startOf());
    await tick();
    const seen = collect(run.events);
    let resolved = false;
    const cancelled = run.cancel().then(() => {
      resolved = true;
    });
    await tick();
    await tick();
    expect(r.engine.cancels).toEqual([0]);
    expect(resolved).toBe(false);
    r.engine.releaseDone();
    await cancelled;
    expect(resolved).toBe(true);
    expect(failureOf(finishedOf(await seen)).kind).toBe("cancelled");
    expect(failureOf(await run.settled).kind).toBe("cancelled");
  });

  test("the finished event says gone when the engine confirmed the tree, and unconfirmed when it gave up", async () => {
    for (const tree of ["gone", "unconfirmed"] as const) {
      const r = rig([{ hang: true, tree }]);
      const run = agentOf(r).start(startOf());
      await tick();
      await run.cancel();
      const events = await collect(run.events);
      expect(failureOf(finishedOf(events)).kind).toBe("cancelled");
      expect(events.at(-1)).toMatchObject({ kind: "finished", tree });
    }
  });

  test("an unconfirmed tree on the first attempt stays unconfirmed after a recovery", async () => {
    const r = rig([
      { events: [{ kind: "started", engine: "sdk" }], result: { ok: false, failure: { kind: "session-not-found", message: "gone", sessionId: "s" } }, tree: "unconfirmed" },
      {},
    ]);
    const run = agentOf(r).start(startOf({ resume: { sessionId: "s" as never, recoveryPrompt: "again" } }));
    expect((await run.settled).ok).toBe(true);
    expect((await collect(run.events)).at(-1)).toMatchObject({ kind: "finished", tree: "unconfirmed" });
  });

  test("a second cancel is a no-op that resolves", async () => {
    const r = rig([{ hang: true }]);
    const run = agentOf(r).start(startOf());
    await tick();
    await Promise.all([run.cancel(), run.cancel()]);
    await run.cancel();
    expect(r.engine.cancels).toEqual([0]);
    expect(failureOf(await run.settled).kind).toBe("cancelled");
  });

  test("cancel after the run finished changes nothing", async () => {
    const r = rig([{}]);
    const run = agentOf(r).start(startOf());
    expect((await run.settled).ok).toBe(true);
    await run.cancel();
    expect((await run.settled).ok).toBe(true);
    expect(finishedOf(await collect(run.events)).ok).toBe(true);
  });

  test("a cancel during recovery stops the fresh run too", async () => {
    const r = rig([
      { events: [{ kind: "started", engine: "sdk" }], result: { ok: false, failure: { kind: "session-not-found", message: "gone", sessionId: "s" } } },
      { hang: true },
    ]);
    const run = agentOf(r).start(startOf({ resume: { sessionId: "s" as never, recoveryPrompt: "again" } }));
    await tick();
    await run.cancel();
    expect(failureOf(await run.settled).kind).toBe("cancelled");
    expect(r.engine.cancels).toEqual([1]);
  });
});

describe("timeouts and signals", () => {
  test("timeoutMs aborts with a timeout failure", async () => {
    const r = rig([{ hang: true }]);
    const run = agentOf(r, { ...options, timeoutMs: 500 }).start(startOf());
    await tick();
    r.clock.advance(500);
    const failure = failureOf(await run.settled);
    expect(failure.kind === "timeout" && failure.timeoutMs === 500).toBe(true);
    expect(r.engine.starts[0]?.signal.aborted).toBe(true);
  });

  test("idleTimeoutMs fires without events and is reset by events", async () => {
    const quiet = rig([{ hang: true }]);
    const run = agentOf(quiet, { ...options, idleTimeoutMs: 100 }).start(startOf());
    await tick();
    quiet.clock.advance(100);
    const failure = failureOf(await run.settled);
    expect(failure.kind === "timeout" && failure.timeoutMs === 100).toBe(true);

    const busy = rig([{ events: [{ kind: "text", text: "a" }] }]);
    const busyRun = agentOf(busy, { ...options, idleTimeoutMs: 100 }).start(startOf());
    expect((await busyRun.settled).ok).toBe(true);
    busy.clock.advance(1000);
  });

  test("options.signal aborts with an aborted failure, before or after the start", async () => {
    const early = new AbortController();
    early.abort();
    const r1 = rig([{ hang: true }]);
    const run1 = agentOf(r1, { ...options, signal: early.signal }).start(startOf());
    expect(failureOf(await run1.settled).kind).toBe("aborted");
    expect(r1.engine.starts).toHaveLength(0);

    const late = new AbortController();
    const r2 = rig([{ hang: true }]);
    const run2 = agentOf(r2, { ...options, signal: late.signal }).start(startOf());
    await tick();
    late.abort();
    expect(failureOf(await run2.settled).kind).toBe("aborted");
  });

  test("closing the runtime aborts a live run and waits for it", async () => {
    const r = rig([{ hang: true }]);
    const run = agentOf(r).start(startOf());
    await tick();
    await r.runtime.close();
    expect(failureOf(await run.settled).kind).toBe("aborted");
  });
});
