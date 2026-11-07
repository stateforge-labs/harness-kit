import { describe, expect, test } from "bun:test";
import { refusesToStart, startServer } from "./harness.ts";

describe("e2e: PORT", () => {
  // Number() would turn "" into 0 (a random port), "0x10" into 16 and " 80 " into 80.
  test.each(["", "abc", "-1", "1.5", "0x10", " 80 ", "65536", "70000", "1e3"])("PORT=%j is refused with a clear message and nothing listens", async (port) => {
    const r = await refusesToStart({ PORT: port });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("PORT must be a whole number from 0 to 65535");
    expect(r.stdout).not.toContain("listening");
  });

  test("PORT=0 asks the system for a free port and the server answers there", async () => {
    const srv = await startServer({ PORT: "0" });
    try {
      expect((await fetch(`${srv.base}/healthz`)).status).toBe(200);
    } finally {
      await srv.stop();
    }
  });

  test("a bad HOOK_LOG_MAX_BYTES is refused the same way", async () => {
    for (const v of ["", "abc", "-5", "0", "1.5"]) {
      const r = await refusesToStart({ HOOK_LOG_MAX_BYTES: v });
      expect(r.code).toBe(2);
      expect(r.stderr).toContain("HOOK_LOG_MAX_BYTES");
    }
  });
});

describe("e2e: bind address", () => {
  test("by default the server listens on loopback only", async () => {
    const srv = await startServer();
    try {
      expect(srv.host).toBe("127.0.0.1");
      const port = srv.port;
      // Any other address of this machine must not reach it: it would answer if the server were bound to all interfaces.
      const others = Object.values(require("node:os").networkInterfaces() as Record<string, { address: string; family: string; internal: boolean }[]>)
        .flat()
        .filter((a) => a && !a.internal && a.family === "IPv4")
        .map((a) => a.address);
      for (const addr of others) {
        const res = await fetch(`http://${addr}:${port}/healthz`, { signal: AbortSignal.timeout(1500) }).catch(() => null);
        expect(res).toBeNull();
      }
    } finally {
      await srv.stop();
    }
  });

  test("a non-loopback host with an empty token is refused", async () => {
    for (const host of ["0.0.0.0", "::", "192.168.1.10", "example.test"]) {
      const r = await refusesToStart({ HOOK_HOST: host });
      expect(r.code).toBe(2);
      expect(r.stderr).toContain("HOOK_TOKEN is empty");
      expect(r.stderr).toContain(host);
      expect(r.stdout).not.toContain("listening");
    }
  });

  test("an empty HOOK_HOST is refused", async () => {
    const r = await refusesToStart({ HOOK_HOST: "" });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("HOOK_HOST must not be empty");
  });

  test("a non-loopback host starts when a token is set, and the error never prints the token", async () => {
    const secret = "tok-never-print-me";
    const srv = await startServer({ HOOK_HOST: "0.0.0.0", HOOK_TOKEN: secret });
    try {
      const res = await fetch(`${srv.base}/hook`, { method: "POST", body: "{}" });
      expect(res.status).toBe(401);
    } finally {
      await srv.stop();
    }
    const bad = await refusesToStart({ HOOK_HOST: "0.0.0.0", HOOK_TOKEN: "", PORT: "abc" });
    expect(bad.stderr).not.toContain(secret);
  });

  test("an explicit loopback host with an empty token starts", async () => {
    for (const host of ["127.0.0.1", "127.0.0.2", "localhost"]) {
      const srv = await startServer({ HOOK_HOST: host });
      try {
        const res = await fetch(`http://${host}:${srv.port}/healthz`);
        expect(res.status).toBe(200);
      } finally {
        await srv.stop();
      }
    }
  });
});
