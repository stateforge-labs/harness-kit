import { afterAll, beforeAll, describe, expect, test } from "bun:test";
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

const read = async (file: string) => ((await Bun.file(file).exists()) ? await Bun.file(file).text() : "");
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
        fetch(`${tiny.base}/hook`, { method: "POST", body: JSON.stringify({ hook_event_name: "Stop", session_id: id }) });
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
