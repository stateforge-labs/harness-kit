import { describe, expect, test } from "bun:test";
import { constants } from "node:fs";
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "./harness.ts";
import { EnvVar } from "@homelab/harness-hooks";

const post = (base: string, id: string) =>
  fetch(`${base}/hook`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ hook_event_name: "Stop", session_id: id }) });

const ids = (text: string) => text.split("\n").filter(Boolean).map((l) => (JSON.parse(l) as { session_id: string }).session_id);

describe("e2e: shutdown on a signal", () => {
  test.each(["SIGTERM", "SIGINT"] as const)("%s exits 0 and every event answered before it is in the log", async (signal) => {
    const srv = await startServer();
    const sent = Array.from({ length: 200 }, (_, i) => `down-${i}`);
    await Promise.all(sent.map((id) => post(srv.base, id)));
    const code = await srv.stopKeepingLog(signal);
    try {
      expect(code).toBe(0);
      expect(new Set(ids(await Bun.file(srv.logFile).text())).size).toBe(sent.length);
    } finally {
      await srv.cleanup();
    }
  });

  test("the server stays up to write queued log lines, and exits 0 once they are written", async () => {
    const dir = await mkdtemp(join(tmpdir(), "harness-hooks-fifo-"));
    const fifo = join(dir, "events.jsonl");
    expect(await Bun.spawn(["mkfifo", fifo]).exited).toBe(0);
    const srv = await startServer({ [EnvVar.HookLogFile]: fifo });
    let reader: Awaited<ReturnType<typeof open>> | undefined;
    try {
      for (const id of ["fifo-1", "fifo-2", "fifo-3"]) expect((await post(srv.base, id)).status).toBe(200);
      const exited = srv.stopKeepingLog("SIGTERM");
      const state = await Promise.race([exited.then(() => "exited"), Bun.sleep(700).then(() => "alive")]);
      expect(state).toBe("alive");

      reader = await open(fifo, constants.O_RDWR);
      expect(await exited).toBe(0);
      let text = "";
      const buf = Buffer.alloc(8192);
      for (let i = 0; i < 20 && ids(text).length < 3; i++) {
        const { bytesRead } = await reader.read(buf, 0, buf.length, null);
        text += buf.subarray(0, bytesRead).toString();
      }
      expect(ids(text)).toEqual(["fifo-1", "fifo-2", "fifo-3"]);
    } finally {
      await reader?.close();
      await srv.stop().catch(() => 0);
      await rm(dir, { recursive: true, force: true });
    }
  }, 15000);

  test("when the grace period runs out with log lines still queued, they are written before the exit 1", async () => {
    const dir = await mkdtemp(join(tmpdir(), "harness-hooks-fifo-"));
    const fifo = join(dir, "events.jsonl");
    expect(await Bun.spawn(["mkfifo", fifo]).exited).toBe(0);
    const srv = await startServer({ [EnvVar.HookLogFile]: fifo, [EnvVar.HookShutdownGraceMs]: "300" });
    const sock = await Bun.connect({ hostname: "127.0.0.1", port: srv.port, socket: { data() {}, error() {}, close() {} } });
    let reader: Awaited<ReturnType<typeof open>> | undefined;
    try {
      for (const id of ["late-1", "late-2"]) expect((await post(srv.base, id)).status).toBe(200);
      sock.write(`POST /hook HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{`);
      await Bun.sleep(100);
      const exited = srv.stopKeepingLog("SIGTERM");
      expect(await Promise.race([exited.then(() => "exited"), Bun.sleep(1200).then(() => "alive")])).toBe("alive");
      reader = await open(fifo, constants.O_RDWR);
      expect(await exited).toBe(1);
      let text = "";
      const buf = Buffer.alloc(8192);
      for (let i = 0; i < 20 && ids(text).length < 2; i++) {
        const { bytesRead } = await reader.read(buf, 0, buf.length, null);
        text += buf.subarray(0, bytesRead).toString();
      }
      expect(ids(text)).toEqual(["late-1", "late-2"]);
    } finally {
      sock.end();
      await reader?.close();
      await srv.stop().catch(() => 0);
      await rm(dir, { recursive: true, force: true });
    }
  }, 15000);

  test("after the signal the port no longer answers", async () => {
    const srv = await startServer();
    try {
      const base = srv.base;
      expect((await fetch(`${base}/healthz`)).status).toBe(200);
      expect(await srv.stop()).toBe(0);
      expect(await fetch(`${base}/healthz`).catch(() => null)).toBeNull();
    } finally {
      await srv.cleanup();
    }
  });

  test("a request that never finishes is closed after the grace period: exit 1, log still flushed", async () => {
    const srv = await startServer({ [EnvVar.HookShutdownGraceMs]: "400" });
    const sock = await Bun.connect({ hostname: "127.0.0.1", port: srv.port, socket: { data() {}, error() {}, close() {} } });
    try {
      expect((await post(srv.base, "stall-ok")).status).toBe(200);
      sock.write(`POST /hook HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{`);
      await Bun.sleep(100);
      const started = performance.now();
      const code = await srv.stopKeepingLog("SIGTERM");
      const took = performance.now() - started;
      expect(code).toBe(1);
      expect(took).toBeGreaterThan(300);
      expect(took).toBeLessThan(4000);
      expect(ids(await Bun.file(srv.logFile).text())).toContain("stall-ok");
    } finally {
      sock.end();
      await srv.cleanup();
    }
  }, 15000);
});
