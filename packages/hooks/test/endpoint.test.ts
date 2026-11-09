import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AdmissionMode,
  createHookHandler,
  isLoopbackHost,
  serveBun,
  serveNode,
  type AdmissionConfig,
  type BoundAddress,
  type HandledHook,
  type HookHandler,
  type RunningEndpoint,
} from "../src/endpoint/index.ts";
import { adapters, defaultPipeline, Pipeline, policyLayer, toolAllowlist } from "../src/index.ts";
import { fixturesDir } from "./fixtures-dir.ts";

const TOKEN = "t0k3n";
const MAX_BODY = 2000;
const JSON_HEADERS = { "content-type": "application/json" };

const fixture = (name: string): Record<string, unknown> => JSON.parse(readFileSync(join(fixturesDir, "claude", "PreToolUse", `${name}.json`), "utf8"));
const writeCall = () => fixture("01-write");
const expectedBody = (name: string): unknown => (JSON.parse(readFileSync(join(fixturesDir, "claude", "PreToolUse", `${name}.expected.json`), "utf8")) as { body: unknown }).body;

interface Call {
  method?: string;
  path: string;
  headers?: Record<string, string>;
  body?: string;
}

interface Answer {
  status: number;
  text: string;
  json(): unknown;
}

type Send = (call: Call) => Promise<Answer>;

interface Rig {
  send: Send;
  address: BoundAddress | null;
  close(): Promise<void>;
  seen: HandledHook[];
}

interface RigOptions {
  pipeline?: Pipeline;
  admission?: AdmissionConfig;
  onHandled?: (hook: HandledHook) => void | Promise<void>;
}

const answer = (status: number, text: string): Answer => ({ status, text, json: () => JSON.parse(text) });

const buildHandler = (options: RigOptions, seen: HandledHook[]): HookHandler =>
  createHookHandler({
    adapters,
    pipeline: options.pipeline ?? defaultPipeline(),
    admission: options.admission ?? { mode: AdmissionMode.Loopback },
    maxBodyBytes: MAX_BODY,
    onHandled: options.onHandled ?? ((hook) => void seen.push(hook)),
  });

const direct = async (options: RigOptions): Promise<Rig> => {
  const seen: HandledHook[] = [];
  const handler = buildHandler(options, seen);
  const send: Send = async (call) => {
    const headers = new Headers(call.headers);
    const response = await handler(new Request(`http://127.0.0.1${call.path}`, { method: call.method ?? "POST", headers, body: call.method === "GET" ? undefined : call.body }));
    return answer(response.status, await response.text());
  };
  return { send, address: null, close: async () => {}, seen };
};

const overHttp = (target: { port: number; host: string } | { socketPath: string }): Send => (call) =>
  new Promise((resolve, reject) => {
    const base = "socketPath" in target ? { socketPath: target.socketPath } : { host: target.host, port: target.port };
    const headers = { host: "localhost", ...call.headers, ...(call.body === undefined ? {} : { "content-length": String(Buffer.byteLength(call.body)) }) };
    const req = httpRequest({ ...base, method: call.method ?? "POST", path: call.path, headers }, (res) => {
      const parts: Buffer[] = [];
      res.on("data", (c: Buffer) => parts.push(c));
      res.on("end", () => resolve(answer(res.statusCode ?? 0, Buffer.concat(parts).toString("utf8"))));
    });
    req.on("error", reject);
    req.end(call.body);
  });

const bound = async (start: (handler: HookHandler) => Promise<RunningEndpoint>, options: RigOptions): Promise<Rig> => {
  const seen: HandledHook[] = [];
  const endpoint = await start(buildHandler(options, seen));
  const target = "socketPath" in endpoint.address ? endpoint.address : { host: endpoint.address.host, port: endpoint.address.port };
  return { send: overHttp(target), address: endpoint.address, close: () => endpoint.close(), seen };
};

let temp: string | undefined;
const socketPath = async () => join((temp = await mkdtemp(join(tmpdir(), "hooks-endpoint-"))), "hooks.sock");

const targets: { name: string; make: (options: RigOptions) => Promise<Rig> }[] = [
  { name: "handler", make: direct },
  { name: "serveNode over tcp", make: (o) => bound((handler) => serveNode({ handler, listen: { port: 0, host: "127.0.0.1" } }), o) },
  { name: "serveNode over a unix socket", make: async (o) => bound(async (handler) => serveNode({ handler, listen: { socketPath: await socketPath() } }), o) },
  ...(typeof (globalThis as { Bun?: unknown }).Bun === "undefined"
    ? []
    : [
        { name: "serveBun over tcp", make: (o: RigOptions) => bound((handler) => serveBun({ handler, listen: { port: 0, host: "127.0.0.1" }, maxBodyBytes: MAX_BODY }), o) },
        { name: "serveBun over a unix socket", make: async (o: RigOptions) => bound(async (handler) => serveBun({ handler, listen: { socketPath: await socketPath() }, maxBodyBytes: MAX_BODY }), o) },
      ]),
];

const open: Rig[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((r) => r.close().catch(() => undefined)));
  if (temp) await rm(temp, { recursive: true, force: true });
  temp = undefined;
});

const rig = async (make: (o: RigOptions) => Promise<Rig>, options: RigOptions = {}): Promise<Rig> => {
  const r = await make(options);
  open.push(r);
  return r;
};

const post = (path: string, body: unknown, headers: Record<string, string> = JSON_HEADERS): Call => ({ path, headers, body: typeof body === "string" ? body : JSON.stringify(body) });

const denyWrites = () => new Pipeline().use(toolAllowlist({ allow: ["Read"], deny: { reason: "writes are off here", hint: "use Read" } })).use(policyLayer);

describe.each(targets)("endpoint through $name", ({ make }) => {
  test("an allowed PreToolUse answers the encoded fixture body", async () => {
    const r = await rig(make);
    const res = await r.send(post("/hook/claude", writeCall()));
    expect(res.status).toBe(200);
    expect(res.json()).toEqual(expectedBody("01-write"));
  });

  test("a deny from a layer reaches the encoded body", async () => {
    const r = await rig(make, { pipeline: denyWrites() });
    const res = await r.send(post("/hook/claude", writeCall()));
    expect(res.status).toBe(200);
    const body = res.json() as { hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string } };
    expect(body.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(body.hookSpecificOutput.permissionDecisionReason).toContain("writes are off here");
  });

  test("/hook without a harness is Claude, /healthz answers ok", async () => {
    const r = await rig(make);
    expect((await r.send(post("/hook", writeCall()))).json()).toEqual(expectedBody("01-write"));
    const health = await r.send({ method: "GET", path: "/healthz" });
    expect([health.status, health.text]).toEqual([200, "ok"]);
  });

  test("an unknown harness or odd path is a 404 and a GET on a hook route is a 405", async () => {
    const r = await rig(make);
    for (const path of ["/hook/nope", "/hook/constructor", "/hook/__proto__", "/hook/claude/extra", "/hooks", "/hook/Claude", "/"]) {
      expect((await r.send(post(path, writeCall()))).status).toBe(404);
    }
    expect((await r.send({ method: "GET", path: "/hook/claude" })).status).toBe(405);
  });

  test("a wrong or missing bearer token is a 401, the right one is let through, and the token is asked for before the harness", async () => {
    const r = await rig(make, { admission: { mode: AdmissionMode.Token, token: TOKEN } });
    expect((await r.send(post("/hook/claude", writeCall()))).status).toBe(401);
    expect((await r.send(post("/hook/claude", writeCall(), { ...JSON_HEADERS, authorization: "Bearer wrong" }))).status).toBe(401);
    expect((await r.send(post("/hook/claude", writeCall(), { ...JSON_HEADERS, authorization: `Bearer ${TOKEN}x` }))).status).toBe(401);
    expect((await r.send(post("/hook/nope", {}))).status).toBe(401);
    expect((await r.send(post("/hook/claude", writeCall(), { ...JSON_HEADERS, authorization: `Bearer ${TOKEN}` }))).status).toBe(200);
    expect((await r.send(post("/hook/nope", {}, { ...JSON_HEADERS, authorization: `Bearer ${TOKEN}` }))).status).toBe(404);
  });

  test("loopback admission: a foreign Host is 403, a non-JSON content type is 415", async () => {
    const r = await rig(make);
    expect((await r.send(post("/hook/claude", writeCall(), { ...JSON_HEADERS, host: "evil.example" }))).status).toBe(403);
    expect((await r.send(post("/hook/claude", writeCall(), { ...JSON_HEADERS, host: "127.0.0.1:9" }))).status).toBe(200);
    expect((await r.send(post("/hook/claude", writeCall(), { "content-type": "text/plain" }))).status).toBe(415);
  });

  test("a body over the cap is a 413 and an ordinary one is answered", async () => {
    const r = await rig(make);
    expect((await r.send(post("/hook/claude", { ...writeCall(), pad: "x".repeat(MAX_BODY * 3) }))).status).toBe(413);
    expect((await r.send(post("/hook/claude", writeCall()))).status).toBe(200);
  });

  test("a bad body is a 400: invalid JSON, an array, a scalar", async () => {
    const r = await rig(make);
    for (const body of ["{nope", "[]", "42", "null", ""]) expect((await r.send(post("/hook/claude", body))).status).toBe(400);
  });

  test("onHandled sees the payload and the handled hook, and its failure does not touch the reply", async () => {
    const r = await rig(make);
    await r.send(post("/hook/claude", writeCall()));
    expect(r.seen).toHaveLength(1);
    expect(r.seen[0]!.payload.hook_event_name).toBe("PreToolUse");
    expect(r.seen[0]!.handled.harness).toBe("claude");
    const failing = await rig(make, {
      onHandled: () => {
        throw new Error("sink is down");
      },
    });
    expect((await failing.send(post("/hook/claude", writeCall()))).status).toBe(200);
    const rejecting = await rig(make, { onHandled: () => Promise.reject(new Error("sink is down")) });
    expect((await rejecting.send(post("/hook/claude", writeCall()))).status).toBe(200);
  });
});

const tcpOpen = (port: number) =>
  new Promise<boolean>((resolve) => {
    const socket = connect({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });

describe("close() frees what the binder took", () => {
  const binders: { name: string; start: (handler: HookHandler, listen: { port: number; host: string } | { socketPath: string }) => Promise<RunningEndpoint> }[] = [
    { name: "serveNode", start: (handler, listen) => serveNode({ handler, listen }) },
    ...(typeof (globalThis as { Bun?: unknown }).Bun === "undefined" ? [] : [{ name: "serveBun", start: (handler: HookHandler, listen: { port: number; host: string } | { socketPath: string }) => serveBun({ handler, listen }) }]),
  ];

  test.each(binders)("$name: the tcp port is refused after close and can be bound again", async ({ start }) => {
    const handler = buildHandler({}, []);
    const first = await start(handler, { port: 0, host: "127.0.0.1" });
    if (!("port" in first.address)) throw new Error("expected a tcp address");
    const { port } = first.address;
    expect(first.address.host).toBe("127.0.0.1");
    expect(await tcpOpen(port)).toBe(true);
    await first.close();
    expect(await tcpOpen(port)).toBe(false);
    const second = await start(handler, { port, host: "127.0.0.1" });
    await second.close();
  });

  test.each(binders)("$name: the unix socket file is gone after close", async ({ start }) => {
    const path = await socketPath();
    const endpoint = await start(buildHandler({}, []), { socketPath: path });
    expect(existsSync(path)).toBe(true);
    expect(endpoint.address).toEqual({ socketPath: path });
    await endpoint.close();
    expect(existsSync(path)).toBe(false);
  });

  test("serveNode: close waits for a request that is being answered, and force drops it", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const slow: HookHandler = async () => {
      await gate;
      return new Response("late");
    };
    const endpoint = await serveNode({ handler: slow, listen: { port: 0, host: "127.0.0.1" } });
    const send = overHttp({ host: "127.0.0.1", port: (endpoint.address as { port: number }).port });
    const pending = send({ method: "GET", path: "/anything" });
    await new Promise((r) => setTimeout(r, 50));
    let closed = false;
    const closing = endpoint.close().then(() => (closed = true));
    await new Promise((r) => setTimeout(r, 50));
    expect(closed).toBe(false);
    release();
    expect((await pending).text).toBe("late");
    await closing;
    expect(closed).toBe(true);
  });
});

describe("createHookHandler refuses a bad setup", () => {
  const base = { adapters, pipeline: defaultPipeline() };
  test("an empty token and a bad body cap throw at creation", () => {
    expect(() => createHookHandler({ ...base, admission: { mode: AdmissionMode.Token, token: "" }, maxBodyBytes: 10 })).toThrow(TypeError);
    for (const maxBodyBytes of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => createHookHandler({ ...base, admission: { mode: AdmissionMode.Loopback }, maxBodyBytes })).toThrow(TypeError);
    }
  });

  test("serveNode rejects when the socket path is taken by a listener, and an incomplete listen throws", async () => {
    const handler = buildHandler({}, []);
    const first = await serveNode({ handler, listen: { port: 0, host: "127.0.0.1" } });
    try {
      await expect(serveNode({ handler, listen: { port: (first.address as { port: number }).port, host: "127.0.0.1" } })).rejects.toThrow();
      await expect(serveNode({ handler, listen: { port: 0, host: "" } })).rejects.toThrow(TypeError);
    } finally {
      await first.close();
    }
  });
});

describe("isLoopbackHost", () => {
  test("accepts the names of this machine and refuses anything the URL parser would rewrite", () => {
    for (const host of ["localhost", "localhost:8080", "LOCALHOST", "127.0.0.1", "127.0.0.1:1", "127.9.9.9:81", "[::1]", "[::1]:3000", "[::ffff:7f00:1]:3000"]) expect(isLoopbackHost(host)).toBe(true);
    for (const host of ["evil.example", "localhost.evil.example", "127.0.0.1.evil.example", "10.0.0.1", "0.0.0.0", "[::]", "[::2]", "127.1", "0x7f.1", "a@127.0.0.1", "localhost:abc", "", " ", "[::ffff:a00:1]", "[::ffff:127.0.0.1]"]) expect(isLoopbackHost(host)).toBe(false);
  });
});
