import { describe, expect, test } from "bun:test";
import { eventually, startServer } from "./harness.ts";
import { fixture as fixtureOf, variant } from "./kit.ts";

const fixture = (event: string, fragment = "") => fixtureOf("claude", event, fragment);

const JSON_HEADERS = { "content-type": "application/json" };
const send = (base: string, path: string, body: unknown, headers: Record<string, string> = JSON_HEADERS, method = "POST") =>
  fetch(`${base}${path}`, { method, headers, body: method === "POST" ? JSON.stringify(body) : undefined });

describe("e2e: routes", () => {
  test("POST /hook/<harness> reaches an adapter, and an unknown or odd harness name is a 404", async () => {
    const srv = await startServer();
    try {
      const body = variant(fixture("SessionStart"));
      expect((await send(srv.base, "/hook/claude", body)).status).toBe(200);
      // Prototype keys must not resolve to an adapter, and the path shape is exact.
      for (const path of ["/hook/", "/hook/nope", "/hook/constructor", "/hook/__proto__", "/hook/toString", "/hook/claude/extra", "/hooks", "/hook/Claude"]) {
        expect((await send(srv.base, path, body)).status).toBe(404);
      }
    } finally {
      await srv.stop();
    }
  });

  test("GET on a harness route is a 405", async () => {
    const srv = await startServer();
    try {
      expect((await send(srv.base, "/hook/claude", null, {}, "GET")).status).toBe(405);
      expect((await send(srv.base, "/hook", null, {}, "GET")).status).toBe(405);
    } finally {
      await srv.stop();
    }
  });

  test("/hook and /hook/claude give the same answer and the same log line", async () => {
    const srv = await startServer();
    try {
      const a = variant(fixture("PreToolUse", "agent"), {}, "route-a");
      const b = variant(fixture("PreToolUse", "agent"), {}, "route-b");
      const [ra, rb] = [await send(srv.base, "/hook", a), await send(srv.base, "/hook/claude", b)];
      expect(ra.status).toBe(rb.status);
      expect(await ra.json()).toEqual(await rb.json());
      const lines = await eventually(async () => {
        const text = await Bun.file(srv.logFile).text().catch(() => "");
        const got = text.split("\n").filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>);
        return got.length >= 2 ? got : undefined;
      });
      const strip = ({ ts: _ts, session_id: _s, ...rest }: Record<string, unknown>) => JSON.stringify(rest);
      expect(strip(lines[0]!)).toBe(strip(lines[1]!));
    } finally {
      await srv.stop();
    }
  });

  test("with a token, every route asks for it first: no token is 401 even for a harness that does not exist", async () => {
    const srv = await startServer({ HOOK_TOKEN: "t0k3n" });
    try {
      for (const path of ["/hook", "/hook/claude", "/hook/nope"]) {
        expect((await send(srv.base, path, {})).status).toBe(401);
        expect((await send(srv.base, path, {}, { ...JSON_HEADERS, authorization: "Bearer t0k3n" })).status).toBe(path === "/hook/nope" ? 404 : 200);
      }
    } finally {
      await srv.stop();
    }
  });

  test("without a token, the Host and content-type checks apply to every route", async () => {
    const srv = await startServer();
    try {
      for (const path of ["/hook", "/hook/claude"]) {
        expect((await send(srv.base, path, {}, { "content-type": "text/plain" })).status).toBe(415);
        expect((await send(srv.base, path, {}, { ...JSON_HEADERS, host: "evil.example" })).status).toBe(403);
      }
    } finally {
      await srv.stop();
    }
  });
});
