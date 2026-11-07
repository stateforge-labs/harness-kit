import { describe, expect, test } from "bun:test";
import { startServer } from "./harness.ts";

const post = (base: string, id: string) =>
  fetch(`${base}/hook`, { method: "POST", body: JSON.stringify({ hook_event_name: "Stop", session_id: id }) });

describe("e2e: shutdown on a signal", () => {
  test.each(["SIGTERM", "SIGINT"] as const)("%s exits 0 and every event answered before it is in the log", async (signal) => {
    const srv = await startServer();
    const ids = Array.from({ length: 200 }, (_, i) => `down-${i}`);
    await Promise.all(ids.map((id) => post(srv.base, id)));

    // Read the log after the process has gone: the lines queued behind the responses must have been flushed.
    const logFile = srv.logFile;
    const code = await srv.stopKeepingLog(signal);
    try {
      expect(code).toBe(0);
      const text = await Bun.file(logFile).text();
      const seen = new Set(text.split("\n").filter(Boolean).map((l) => (JSON.parse(l) as { session_id: string }).session_id));
      expect(seen.size).toBe(ids.length);
    } finally {
      await srv.cleanup();
    }
  });

  test("after the signal the port no longer answers", async () => {
    const srv = await startServer();
    const base = srv.base;
    expect((await fetch(`${base}/healthz`)).status).toBe(200);
    expect(await srv.stop()).toBe(0);
    expect(await fetch(`${base}/healthz`).catch(() => null)).toBeNull();
  });
});
