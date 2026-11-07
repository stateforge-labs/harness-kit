import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eventually, startServer, type RunningServer } from "./harness.ts";

const CAP = 1500;
let srv: RunningServer;
beforeAll(async () => {
  srv = await startServer({ HOOK_LOG_MAX_BYTES: String(CAP) });
});
afterAll(() => srv.stop());

const post = (sessionId: string) =>
  fetch(`${srv.base}/hook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hook_event_name: "Stop", session_id: sessionId, transcript_path: "/x", cwd: "/x", stop_hook_active: false }),
  });

// The file is briefly absent between a rotation's rename and the append that recreates it, so a missing file reads as empty.
const read = async (file: string) => {
  try {
    return await Bun.file(file).text();
  } catch {
    return "";
  }
};
const sessions = (text: string) => text.split("\n").filter(Boolean).map((l) => (JSON.parse(l) as { session_id: string }).session_id);

describe("e2e: the log is capped", () => {
  test("it rotates to .1 before passing the cap and keeps the newest event in the main file", async () => {
    for (let i = 0; i < 40; i++) await post(`cap-seq-${i}`);
    await eventually(async () => ((await read(srv.logFile)).includes('"cap-seq-39"') ? true : undefined));

    const main = await read(srv.logFile);
    const old = await read(`${srv.logFile}.1`);
    expect(Buffer.byteLength(main)).toBeLessThanOrEqual(CAP);
    expect(Buffer.byteLength(old)).toBeLessThanOrEqual(CAP);
    expect(old.length).toBeGreaterThan(0);
    // Every line is whole, and the old generation holds older events than the main file.
    const newest = sessions(main);
    const older = sessions(old);
    expect(newest.at(-1)).toBe("cap-seq-39");
    expect(Number(older.at(-1)?.split("-").at(-1))).toBeLessThan(Number(newest[0]?.split("-").at(-1)));
    // Only one old generation is kept, so the oldest events are gone.
    expect(sessions(main + old)).not.toContain("cap-seq-0");
  });

  test("events posted at the same time never tear a line or push a file past the cap", async () => {
    await Promise.all(Array.from({ length: 60 }, (_, i) => post(`cap-par-${i}`)));
    await eventually(async () => {
      const all = sessions((await read(srv.logFile)) + (await read(`${srv.logFile}.1`)));
      return all.filter((s) => s.startsWith("cap-par-")).length >= 10 ? true : undefined;
    });
    await Bun.sleep(200);
    for (const f of [srv.logFile, `${srv.logFile}.1`]) {
      const text = await read(f);
      expect(Buffer.byteLength(text)).toBeLessThanOrEqual(CAP);
      expect(text === "" || text.endsWith("\n")).toBe(true);
      expect(() => sessions(text)).not.toThrow();
    }
  });
});

describe("e2e: a line larger than the cap", () => {
  test("is still written, alone in the main file, and the next event rotates it away", async () => {
    const tiny = await startServer({ HOOK_LOG_MAX_BYTES: "50" });
    try {
      const send = (id: string) =>
        fetch(`${tiny.base}/hook`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ hook_event_name: "Stop", session_id: id }) });
      await send("big-1");
      await eventually(async () => ((await read(tiny.logFile)).includes("big-1") ? true : undefined));
      expect(sessions(await read(tiny.logFile))).toEqual(["big-1"]);
      await send("big-2");
      await eventually(async () => ((await read(tiny.logFile)).includes("big-2") ? true : undefined));
      expect(sessions(await read(tiny.logFile))).toEqual(["big-2"]);
      expect(sessions(await read(`${tiny.logFile}.1`))).toEqual(["big-1"]);
    } finally {
      await tiny.stop();
    }
  });
});

const send = (base: string, body: unknown) =>
  fetch(`${base}/hook`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("e2e: nothing is lost or left unbounded", () => {
  test("sixty events posted at once all reach the log, once each, as whole lines", async () => {
    const srv2 = await startServer();
    try {
      const ids = Array.from({ length: 60 }, (_, i) => `all-${i}`);
      await Promise.all(ids.map((id) => send(srv2.base, { hook_event_name: "Stop", session_id: id })));
      const seen = await eventually(async () => {
        const got = sessions(await read(srv2.logFile));
        return got.length >= ids.length ? got : undefined;
      });
      expect([...seen].sort()).toEqual([...ids].sort());
    } finally {
      await srv2.stop();
    }
  });

  test("a rotation that fails does not stop the log: events keep landing", async () => {
    const s2 = await startServer({ HOOK_LOG_MAX_BYTES: "300" });
    try {
      // A non-empty directory where the old generation should go makes every rename fail.
      await mkdir(`${s2.logFile}.1/keep`, { recursive: true });
      for (let i = 0; i < 6; i++) await send(s2.base, { hook_event_name: "Stop", session_id: `rot-${i}` });
      await eventually(async () => (sessions(await read(s2.logFile)).length >= 6 ? true : undefined));
      expect(sessions(await read(s2.logFile))).toEqual(Array.from({ length: 6 }, (_, i) => `rot-${i}`));
    } finally {
      await s2.stop();
    }
  });

  test("a long value in the metadata log is cut, so one request cannot make a huge line", async () => {
    const s2 = await startServer();
    try {
      await send(s2.base, { hook_event_name: "Stop", session_id: "clip-1", agent_type: "x".repeat(50_000) });
      const text = await eventually(async () => ((await read(s2.logFile)).includes("clip-1") ? await read(s2.logFile) : undefined));
      expect(Buffer.byteLength(text)).toBeLessThan(2000);
      expect(text).toContain("[50000 chars]");
    } finally {
      await s2.stop();
    }
  });

  test("the log file, and a directory the server has to create for it, are readable by their owner only", async () => {
    const root = await mkdtemp(join(tmpdir(), "harness-hooks-perm-"));
    const logFile = join(root, "fresh", "events.jsonl");
    const s2 = await startServer({ HOOK_LOG_FILE: logFile });
    try {
      await send(s2.base, { hook_event_name: "Stop", session_id: "perm-1" });
      await eventually(async () => ((await read(logFile)).includes("perm-1") ? true : undefined));
      expect((await stat(logFile)).mode & 0o777).toBe(0o600);
      expect((await stat(join(root, "fresh"))).mode & 0o777).toBe(0o700);
    } finally {
      await s2.stop();
      await rm(root, { recursive: true, force: true });
    }
  });
});
