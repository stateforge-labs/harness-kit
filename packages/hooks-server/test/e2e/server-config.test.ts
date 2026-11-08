import { describe, expect, test } from "bun:test";
import { refusesToStart, startServer } from "./harness.ts";
import { EnvVar } from "@homelab/harness-hooks";

describe(`e2e: ${EnvVar.Port}`, () => {
  test.each(["", "abc", "-1", "1.5", "0x10", " 80 ", "65536", "70000", "1e3"])(`${EnvVar.Port}=%j is refused with a clear message and nothing listens`, async (port) => {
    const r = await refusesToStart({ [EnvVar.Port]: port });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain(`${EnvVar.Port} must be a whole number from 0 to 65535`);
    expect(r.stdout).not.toContain("listening");
  });

  test(`${EnvVar.Port}=0 asks the system for a free port and the server answers there`, async () => {
    const srv = await startServer({ [EnvVar.Port]: "0" });
    try {
      expect((await fetch(`${srv.base}/healthz`)).status).toBe(200);
    } finally {
      await srv.stop();
    }
  });

  test(`a bad ${EnvVar.HookLogMaxBytes} is refused the same way`, async () => {
    for (const v of ["", "abc", "-5", "0", "1.5"]) {
      const r = await refusesToStart({ [EnvVar.HookLogMaxBytes]: v });
      expect(r.code).toBe(2);
      expect(r.stderr).toContain(EnvVar.HookLogMaxBytes);
    }
  });
});

describe("e2e: bind address", () => {
  const otherAddresses = (): string[] =>
    Object.values(require("node:os").networkInterfaces() as Record<string, { address: string; family: string; internal: boolean }[]>)
      .flat()
      .filter((a) => a && !a.internal && a.family === "IPv4")
      .map((a) => a.address);

  test("by default the server binds to 127.0.0.1", async () => {
    const srv = await startServer();
    try {
      expect(srv.host).toBe("127.0.0.1");
    } finally {
      await srv.stop();
    }
  });

  test.skipIf(otherAddresses().length === 0)("another address of this machine does not reach a default server", async () => {
    const srv = await startServer();
    try {
      for (const addr of otherAddresses()) {
        const res = await fetch(`http://${addr}:${srv.port}/healthz`, { signal: AbortSignal.timeout(1500) }).catch(() => null);
        expect(res).toBeNull();
      }
    } finally {
      await srv.stop();
    }
  });

  test("a non-loopback host with an empty token is refused", async () => {
    for (const host of ["0.0.0.0", "::", "192.168.1.10", "example.test", "127.999.0.1", "127.0.0.1.evil.test", "user@localhost", "localhost/x", "128.0.0.1", "[::ffff:10.0.0.1]"]) {
      const r = await refusesToStart({ [EnvVar.HookHost]: host });
      expect(r.code).toBe(2);
      expect(r.stderr).toContain(`${EnvVar.HookToken} is empty`);
      expect(r.stderr).toContain(host);
      expect(r.stdout).not.toContain("listening");
    }
  });

  test(`an empty ${EnvVar.HookHost} is refused`, async () => {
    const r = await refusesToStart({ [EnvVar.HookHost]: "" });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain(`${EnvVar.HookHost} must not be empty`);
  });

  test("a non-loopback host starts when a token is set, and the error never prints the token", async () => {
    const secret = "tok-never-print-me";
    const srv = await startServer({ [EnvVar.HookHost]: "0.0.0.0", [EnvVar.HookToken]: secret });
    try {
      const res = await fetch(`${srv.base}/hook`, { method: "POST", body: "{}" });
      expect(res.status).toBe(401);
    } finally {
      await srv.stop();
    }
  });

  test("no refusal message prints the token, even when the token is set next to a bad value", async () => {
    const secret = "tok-never-print-me";
    for (const env of <Record<string, string>[]>[{ [EnvVar.Port]: "abc" }, { [EnvVar.HookLogMaxBytes]: "abc" }, { [EnvVar.HookMaxBodyBytes]: "0" }, { [EnvVar.HookShutdownGraceMs]: "x" }, { [EnvVar.HookHost]: "" }]) {
      const r = await refusesToStart({ ...env, [EnvVar.HookToken]: secret });
      expect(r.code).toBe(2);
      expect(r.stderr + r.stdout).not.toContain(secret);
    }
  });

  test("an explicit loopback host with an empty token starts", async () => {
    for (const host of ["127.0.0.1", "127.0.0.2", "localhost"]) {
      const srv = await startServer({ [EnvVar.HookHost]: host });
      try {
        const res = await fetch(`http://${host}:${srv.port}/healthz`);
        expect(res.status).toBe(200);
      } finally {
        await srv.stop();
      }
    }
  });
});

describe("e2e: a server with no token only answers loopback JSON posts", () => {
  const body = JSON.stringify({ hook_event_name: "Stop", session_id: "guard-1" });
  const post = (base: string, headers: Record<string, string>) => fetch(`${base}/hook`, { method: "POST", headers, body });

  test("a foreign Host header is refused (DNS rebinding), a loopback one is answered", async () => {
    const srv = await startServer();
    try {
      expect((await post(srv.base, { "content-type": "application/json", host: "evil.example" })).status).toBe(403);
      expect((await post(srv.base, { "content-type": "application/json", host: "127.0.0.1.evil.example" })).status).toBe(403);
      expect((await post(srv.base, { "content-type": "application/json", host: `localhost:${srv.port}` })).status).toBe(200);
      expect((await post(srv.base, { "content-type": "application/json", host: `127.0.0.1:${srv.port}` })).status).toBe(200);
      for (const host of ["[::1]", "LOCALHOST", `LocalHost:${srv.port}`, "127.0.0.2"]) {
        expect((await post(srv.base, { "content-type": "application/json", host })).status, host).toBe(200);
      }
      for (const host of ["127.1", "0x7f.1", "2130706433", "[0:0:0:0:0:0:0:1]", "[::ffff:127.0.0.1]", "app.localhost", "user@localhost", "localhost/x", "localhost?x", "0.0.0.0", "[::]", "128.0.0.1", "[::ffff:10.0.0.1]", "a b"]) {
        expect([400, 403], host).toContain((await post(srv.base, { "content-type": "application/json", host })).status);
      }
    } finally {
      await srv.stop();
    }
  });

  test("a body that is not declared JSON is refused (a cross-site form or no-cors fetch cannot send JSON)", async () => {
    const srv = await startServer();
    try {
      expect((await post(srv.base, { "content-type": "text/plain" })).status).toBe(415);
      expect((await post(srv.base, {})).status).toBe(415);
      expect((await post(srv.base, { "content-type": "application/x-www-form-urlencoded" })).status).toBe(415);
      expect((await post(srv.base, { "content-type": "application/json; charset=utf-8" })).status).toBe(200);
    } finally {
      await srv.stop();
    }
  });

  test("a refused post is not logged", async () => {
    const srv = await startServer();
    try {
      await post(srv.base, { "content-type": "text/plain" });
      await post(srv.base, { "content-type": "application/json", host: "evil.example" });
      await Bun.sleep(150);
      expect(await Bun.file(srv.logFile).exists()).toBe(false);
    } finally {
      await srv.stop();
    }
  });

  test("with a token, the Authorization header is the check and the content type is not", async () => {
    const srv = await startServer({ [EnvVar.HookToken]: "t0k3n" });
    try {
      expect((await post(srv.base, { authorization: "Bearer t0k3n" })).status).toBe(200);
      expect((await post(srv.base, { "content-type": "application/json" })).status).toBe(401);
    } finally {
      await srv.stop();
    }
  });
});

describe("e2e: the body size cap", () => {
  test(`a body over ${EnvVar.HookMaxBodyBytes} is refused with 413 and an ordinary one is answered`, async () => {
    const srv = await startServer({ [EnvVar.HookMaxBodyBytes]: "2000" });
    try {
      const send = (extra: string) =>
        fetch(`${srv.base}/hook`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ hook_event_name: "Stop", session_id: "cap-body", pad: extra }) });
      expect((await send("x".repeat(100))).status).toBe(200);
      expect((await send("x".repeat(5000))).status).toBe(413);
    } finally {
      await srv.stop();
    }
  });
});
