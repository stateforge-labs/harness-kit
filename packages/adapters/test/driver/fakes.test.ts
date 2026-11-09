import { describe, expect, test } from "bun:test";
import { Signal, SpawnCode } from "../../src/driver/constants.ts";
import { fakeClock, fakeFs, fakeProcessRunner } from "../support/fakes.ts";

async function collect(stream: AsyncIterable<Uint8Array>): Promise<string> {
  const parts: string[] = [];
  for await (const chunk of stream) {
    parts.push(new TextDecoder().decode(chunk));
  }
  return parts.join("");
}

const SPEC = { program: "p", args: [], env: {}, cwd: "/", stdin: null } as const;

describe("fakeProcessRunner", () => {
  test("replays stdout, stderr and exit code and records specs", async () => {
    const fake = fakeProcessRunner([{ stdout: "out", stderr: "err", code: 4 }]);
    const started = await fake.runner(SPEC);
    expect(started.ok).toBe(true);
    if (!started.ok) {
      return;
    }
    expect(await collect(started.value.stdout)).toBe("out");
    expect(await collect(started.value.stderr)).toBe("err");
    expect(await started.value.exited).toEqual({ code: 4, signal: null });
    expect(fake.specs).toEqual([SPEC]);
  });

  test("fails the spawn once the scripts are exhausted", async () => {
    const fake = fakeProcessRunner([]);
    const started = await fake.runner(SPEC);
    expect(started.ok).toBe(false);
    if (!started.ok) {
      expect(started.failure.code).toBe(SpawnCode.SpawnFailed);
    }
  });

  test("a held process runs until released", async () => {
    const fake = fakeProcessRunner([{ hold: true, code: 0 }]);
    const started = await fake.runner(SPEC);
    if (!started.ok) {
      throw new Error("expected spawn");
    }
    let settled = false;
    void started.value.exited.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    fake.release(0);
    expect(await started.value.exited).toEqual({ code: 0, signal: null });
  });

  test("a SIGTERM ends the process unless it ignores TERM, and SIGKILL always ends it", async () => {
    const fake = fakeProcessRunner([{ hold: true }, { hold: true, ignoreTerm: true }]);
    const first = await fake.runner(SPEC);
    const second = await fake.runner(SPEC);
    if (!first.ok || !second.ok) {
      throw new Error("expected spawns");
    }
    first.value.signalGroup(Signal.Term);
    expect(await first.value.exited).toEqual({ code: null, signal: Signal.Term });

    second.value.signalGroup(Signal.Term);
    second.value.signalGroup(Signal.Kill);
    expect(await second.value.exited).toEqual({ code: null, signal: Signal.Kill });
    expect(fake.signals).toEqual([Signal.Term, Signal.Term, Signal.Kill]);
  });

  test("pipes outliving exit keep streams open until SIGKILL", async () => {
    const fake = fakeProcessRunner([{ stdout: "a", code: 0, pipesOutliveExit: true }]);
    const started = await fake.runner(SPEC);
    if (!started.ok) {
      throw new Error("expected spawn");
    }
    const iterator = started.value.stdout[Symbol.asyncIterator]();
    expect(new TextDecoder().decode((await iterator.next()).value)).toBe("a");
    started.value.signalGroup(Signal.Kill);
    expect((await iterator.next()).done).toBe(true);
  });
});

describe("fakeClock", () => {
  test("fires timers in due order during advance and only up to the target", () => {
    const clock = fakeClock(0);
    const fired: string[] = [];
    clock.after(20, () => fired.push("late"));
    clock.after(5, () => fired.push("early"));
    clock.advance(10);
    expect(fired).toEqual(["early"]);
    expect(clock.now()).toBe(10);
    clock.advance(10);
    expect(fired).toEqual(["early", "late"]);
    expect(clock.now()).toBe(20);
  });

  test("a cancelled timer never fires", () => {
    const clock = fakeClock();
    let fired = false;
    const cancel = clock.after(5, () => {
      fired = true;
    });
    cancel();
    clock.advance(10);
    expect(fired).toBe(false);
  });
});

describe("fakeFs", () => {
  test("makes temp dirs under the parent with a counter suffix", async () => {
    const fs = fakeFs();
    expect(await fs.makeTempDir("run-", "/root")).toBe("/root/run-1");
    expect(await fs.makeTempDir("run-", "/root")).toBe("/root/run-2");
    expect(fs.dirs.has("/root/run-2")).toBe(true);
  });

  test("lists children and returns null for unknown directories", async () => {
    const fs = fakeFs({ dirs: ["/root", { path: "/root/sub", mtimeMs: 7 }], files: { "/root/f.txt": "hi" } });
    expect(await fs.listDir("/root")).toEqual([
      { name: "sub", mtimeMs: 7, isDirectory: true },
      { name: "f.txt", mtimeMs: 0, isDirectory: false },
    ]);
    expect(await fs.listDir("/nope")).toBeNull();
  });

  test("removeTree removes the subtree and records the path", async () => {
    const fs = fakeFs({ dirs: ["/root", "/root/a", "/root/a/b"], files: { "/root/a/f": "x", "/root/keep": "y" } });
    expect(await fs.removeTree("/root/a")).toBe(true);
    expect(fs.removed).toEqual(["/root/a"]);
    expect(fs.dirs.has("/root/a/b")).toBe(false);
    expect(await fs.exists("/root/a/f")).toBe(false);
    expect(await fs.exists("/root/keep")).toBe(true);
    expect(await fs.removeTree("/root/a")).toBe(false);
  });

  test("readText truncates to the byte budget and reports unknown files as null", async () => {
    const fs = fakeFs({ files: { "/f": "abcdef" } });
    expect(await fs.readText("/f", 3)).toBe("abc");
    expect(await fs.readText("/missing", 3)).toBeNull();
  });
});
