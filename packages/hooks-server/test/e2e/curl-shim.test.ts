import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CURL_MIN_VERSION,
  CurlTokenSource,
  EnvDefault,
  EnvVar,
  curlSupports,
  parseCurlVersion,
  processEnv,
  renderCurlShim,
  type CurlShimOptions,
  type CurlTokenSourceName,
} from "@stateforge-labs/harness-hooks";
import { fixture, variant } from "./kit.ts";
import { refusesToStart, spawnWithSocket, startServer, startSocketServer, type RunningServer, type RunningSocketServer } from "./harness.ts";

const mod = (name: string) => join(import.meta.dir, "middleware-modules", `${name}.ts`);
const REASON = "V1-DENY-REASON\nV1-DENY-HINT";

const preToolUse = () => JSON.stringify(variant(fixture("claude", "PreToolUse", "bash")));
const permissionRequest = () => JSON.stringify({ hook_event_name: "PermissionRequest", session_id: `p-${crypto.randomUUID()}`, tool_name: "Bash", tool_input: { command: "ls" } });
const stop = () => JSON.stringify({ hook_event_name: "Stop", session_id: `s-${crypto.randomUUID()}` });

const withContext = { hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: "A" } };
const denyPre = (reason: string) => ({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } });
const denyPerm = (reason: string) => ({ hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "deny", message: reason } } });

let work: string;
let version: string;
let tokenSource: CurlTokenSourceName;
let n = 0;

beforeAll(async () => {
  work = await mkdtemp(join(tmpdir(), "harness-hooks-curl-shim-"));
  const found = parseCurlVersion(await new Response(Bun.spawn(["curl", "--version"], { stdout: "pipe" }).stdout).text());
  if (!found) throw new Error("curl is not on PATH");
  version = found;
  tokenSource = curlSupports(version, CurlTokenSource.Env) ? CurlTokenSource.Env : CurlTokenSource.File;
});
afterAll(() => rm(work, { recursive: true, force: true }));

async function install(options: CurlShimOptions): Promise<string> {
  const path = join(work, `shim-${n++}.sh`);
  await writeFile(path, renderCurlShim(options));
  await chmod(path, 0o755);
  return path;
}

interface Run {
  code: number | null;
  stdout: string;
  stderr: string;
  ms: number;
}

async function run(script: string, event: string, stdin: string, env: Record<string, string> = {}): Promise<Run> {
  const started = performance.now();
  const proc = Bun.spawn([script, event], {
    env: { [EnvVar.Path]: processEnv()[EnvVar.Path] ?? "", ...env },
    stdin: new TextEncoder().encode(stdin),
    stdout: "pipe",
    stderr: "pipe",
  });
  const timer = setTimeout(() => proc.kill(), 15_000);
  const code = await proc.exited;
  clearTimeout(timer);
  return { code: proc.signalCode ? null : code, stdout: await new Response(proc.stdout).text(), stderr: await new Response(proc.stderr).text(), ms: performance.now() - started };
}

const answer = (r: Run): unknown => JSON.parse(r.stdout);

function closedTcpUrl(): string {
  const l = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { open() {}, data() {}, close() {}, error() {} } });
  const port = l.port;
  l.stop(true);
  return `http://127.0.0.1:${port}`;
}

describe("e2e: the curl shim script", () => {
  let sock: RunningSocketServer;
  let denying: RunningSocketServer;
  let tcp: RunningServer;

  beforeAll(async () => {
    sock = await startSocketServer({ [EnvVar.HookMiddleware]: mod("layer-a") });
    denying = await startSocketServer({ [EnvVar.HookMiddleware]: mod("v1-deny") });
    tcp = await startServer({ [EnvVar.HookMiddleware]: mod("layer-a") });
  });
  afterAll(async () => {
    await sock.stop();
    await denying.stop();
    await tcp.stop();
  });

  test("the installed curl is at least the documented minimum for the mechanism the test uses", () => {
    expect(curlSupports(version, tokenSource)).toBe(true);
    expect(CURL_MIN_VERSION[CurlTokenSource.Env]).toBe("8.3.0");
  });

  test("over a unix socket: the server's answer for a PreToolUse payload comes back on stdout", async () => {
    const script = await install({ harness: "claude", socketPath: sock.socketPath });
    const r = await run(script, "PreToolUse", preToolUse());
    expect(r.code).toBe(0);
    expect(r.stderr).toBe("");
    expect(answer(r)).toEqual(withContext);
  });

  test("over TCP: the server's answer for a PreToolUse payload comes back on stdout", async () => {
    const script = await install({ harness: "claude", url: tcp.base });
    const r = await run(script, "PreToolUse", preToolUse());
    expect(r.code).toBe(0);
    expect(answer(r)).toEqual(withContext);
  });

  test("a deny from a layer reaches stdout", async () => {
    const script = await install({ harness: "claude", socketPath: denying.socketPath });
    const r = await run(script, "PreToolUse", preToolUse());
    expect(answer(r)).toEqual(denyPre(REASON));
  });

  test("the request goes to /hook/<harness>: a codex shim reaches the codex adapter", async () => {
    const script = await install({ harness: "codex", socketPath: denying.socketPath });
    const payload = JSON.stringify(variant(fixture("codex", "PreToolUse", "bash")));
    expect(answer(await run(script, "PreToolUse", payload))).toEqual(denyPre(REASON));
  });

  test("a server that answers non-200 or a non-object makes the shim fail open, and closed for PreToolUse", async () => {
    for (const make of [() => new Response("nope", { status: 500 }), () => new Response("not json", { status: 200 }), () => new Response("", { status: 200 }), () => new Response("[1]", { status: 200 })]) {
      const srv = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: make });
      try {
        const base = `http://127.0.0.1:${srv.port}`;
        const open = await install({ harness: "claude", url: base });
        const closed = await install({ harness: "claude", url: base, failClosed: true });
        expect(answer(await run(open, "PreToolUse", preToolUse()))).toEqual({});
        expect(answer(await run(closed, "PreToolUse", preToolUse()))).toEqual(denyPre(EnvDefault.DenyReason));
      } finally {
        await srv.stop(true);
      }
    }
  });

  test("10 concurrent runs over the socket all succeed", async () => {
    const script = await install({ harness: "claude", socketPath: sock.socketPath });
    const runs = await Promise.all(Array.from({ length: 10 }, () => run(script, "PreToolUse", preToolUse())));
    for (const r of runs) {
      expect(r.code).toBe(0);
      expect(answer(r)).toEqual(withContext);
    }
  });
});

describe("e2e: the curl shim script, server down", () => {
  const down = { socket: () => ({ socketPath: join(work, "missing.sock") }), tcp: () => ({ url: closedTcpUrl() }) };

  test.each(["socket", "tcp"] as const)("%s: fail open prints {} for every event", async (kind) => {
    const script = await install({ harness: "claude", ...down[kind]() });
    for (const [event, stdin] of [["PreToolUse", preToolUse()], ["PermissionRequest", permissionRequest()], ["Stop", stop()]] as const) {
      const r = await run(script, event, stdin);
      expect(r.code).toBe(0);
      expect(answer(r)).toEqual({});
    }
  });

  test.each(["socket", "tcp"] as const)("%s: fail closed prints the exact encoded deny for PreToolUse and PermissionRequest", async (kind) => {
    const script = await install({ harness: "claude", failClosed: true, ...down[kind]() });
    const pre = await run(script, "PreToolUse", preToolUse());
    expect(pre.code).toBe(0);
    expect(answer(pre)).toEqual(denyPre(EnvDefault.DenyReason));
    const perm = await run(script, "PermissionRequest", permissionRequest());
    expect(answer(perm)).toEqual(denyPerm(EnvDefault.DenyReason));
  });

  test("fail closed with a custom reason, for codex, including a reason with quotes and a dollar sign", async () => {
    const reason = `it's "closed" $HOME \`id\` \\ end`;
    const script = await install({ harness: "codex", failClosed: true, denyReason: reason, ...down.tcp() });
    expect(answer(await run(script, "PreToolUse", "{}"))).toEqual(denyPre(reason));
    expect(answer(await run(script, "PermissionRequest", "{}"))).toEqual(denyPerm(reason));
  });

  test("fail closed on a Stop event prints {}: a deny on stop is never encoded", async () => {
    const script = await install({ harness: "claude", failClosed: true, ...down.tcp() });
    for (const event of ["Stop", "SubagentStop", "SessionStart", "NotAnEvent"]) {
      const r = await run(script, event, stop());
      expect(r.code).toBe(0);
      expect(answer(r)).toEqual({});
    }
  });

  test("a payload on stdin is not needed to fail: an empty stdin gives the fallback too", async () => {
    const script = await install({ harness: "claude", failClosed: true, ...down.tcp() });
    expect(answer(await run(script, "PreToolUse", ""))).toEqual(denyPre(EnvDefault.DenyReason));
  });

  test(`${EnvVar.ShimDebug}=1 says on stderr why the shim failed, and nothing is said without it`, async () => {
    const script = await install({ harness: "claude", ...down.tcp() });
    const quiet = await run(script, "PreToolUse", preToolUse());
    expect(quiet.stderr).toBe("");
    const loud = await run(script, "PreToolUse", preToolUse(), { [EnvVar.ShimDebug]: "1" });
    expect(loud.stderr).toContain("hook-shim: failing open");
    expect(answer(loud)).toEqual({});
  });

  test("a server that never answers is cut off by the timeout, failing open or closed", async () => {
    const srv = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Promise<Response>(() => {}) });
    try {
      const url = `http://127.0.0.1:${srv.port}`;
      const open = await run(await install({ harness: "claude", url, timeoutMs: 1000 }), "PreToolUse", preToolUse());
      expect(answer(open)).toEqual({});
      expect(open.ms).toBeGreaterThan(900);
      expect(open.ms).toBeLessThan(6000);
      const closed = await run(await install({ harness: "claude", url, timeoutMs: 1000, failClosed: true }), "PreToolUse", preToolUse());
      expect(answer(closed)).toEqual(denyPre(EnvDefault.DenyReason));
    } finally {
      await srv.stop(true);
    }
  });
});

describe("e2e: the curl shim script, token", () => {
  const SECRET = `tok-${crypto.randomUUID()}`;
  let guarded: RunningServer;
  let bin: string;
  let argvLog: string;

  beforeAll(async () => {
    guarded = await startServer({ [EnvVar.HookToken]: SECRET, [EnvVar.HookMiddleware]: mod("v1-deny") });
    bin = join(work, "bin");
    argvLog = join(work, "argv.log");
    await Bun.write(
      join(bin, "curl"),
      [`#!/bin/sh`, `printf '%s\\n' "$$" "$@" >> ${argvLog}`, `printf -- '--\\n' >> ${argvLog}`, `cat /proc/$$/cmdline | tr '\\0' ' ' >> ${argvLog}`, `printf '\\n' >> ${argvLog}`, `exec ${Bun.which("curl")} "$@"`, ""].join("\n"),
    );
    await chmod(join(bin, "curl"), 0o755);
  });
  afterAll(() => guarded.stop());

  const recorded = (): Promise<string> => readFile(argvLog, "utf8").catch(() => "");

  test("the token, when set, authorizes the call and is in no curl argument", async () => {
    const script = await install({ harness: "claude", url: guarded.base, tokenSource: CurlTokenSource.Env });
    const env = { [EnvVar.Path]: `${bin}:${processEnv()[EnvVar.Path] ?? ""}`, [EnvVar.HookToken]: SECRET };
    const sampled: string[] = [];
    const proc = Bun.spawn([script, "PreToolUse"], { env, stdin: new TextEncoder().encode(preToolUse()), stdout: "pipe", stderr: "pipe" });
    const sampler = (async () => {
      while (proc.exitCode === null) {
        for (const pid of (await Array.fromAsync(new Bun.Glob("[0-9]*").scan({ cwd: "/proc", onlyFiles: false }))) as string[]) {
          const cmd = await readFile(`/proc/${pid}/cmdline`, "utf8").catch(() => "");
          if (cmd.includes("curl") || cmd.includes(script)) sampled.push(cmd);
        }
        await Bun.sleep(1);
      }
    })();
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    await sampler;
    expect(JSON.parse(out)).toEqual(denyPre(REASON));
    const log = await recorded();
    expect(log).toContain("--max-time");
    expect(log).not.toContain(SECRET);
    expect(sampled.join("")).not.toContain(SECRET);
  });

  test("without the token the guarded server refuses, so the shim fails open", async () => {
    const script = await install({ harness: "claude", url: guarded.base });
    expect(answer(await run(script, "PreToolUse", preToolUse()))).toEqual({});
    expect(answer(await run(script, "PreToolUse", preToolUse(), { [EnvVar.HookToken]: "wrong" }))).toEqual({});
  });

  test("the header-file mechanism authorizes the call too, and the token is in no argument", async () => {
    const file = join(work, "token.header");
    await writeFile(file, `authorization: Bearer ${SECRET}\n`, { mode: 0o600 });
    const script = await install({ harness: "claude", url: guarded.base, tokenSource: CurlTokenSource.File, tokenFile: file });
    const before = (await recorded()).length;
    const r = await run(script, "PreToolUse", preToolUse(), { [EnvVar.Path]: `${bin}:${processEnv()[EnvVar.Path] ?? ""}` });
    expect(answer(r)).toEqual(denyPre(REASON));
    const added = (await recorded()).slice(before);
    expect(added).toContain("--header");
    expect(added).not.toContain(SECRET);
    expect(CURL_MIN_VERSION[CurlTokenSource.File]).toBe("7.55.0");
  });
});

describe("e2e: the server on a unix socket", () => {
  test("the socket file is user-only and goes away when the server stops", async () => {
    const srv = await startSocketServer();
    expect((await stat(srv.socketPath)).isSocket()).toBe(true);
    expect((await stat(srv.socketPath)).mode & 0o777).toBe(0o600);
    const dir = srv.dir;
    const path = srv.socketPath;
    const probe = await Bun.spawn(["curl", "-s", "--unix-socket", path, "http://localhost/healthz"], { stdout: "pipe" });
    expect(await new Response(probe.stdout).text()).toBe("ok");
    expect(await srv.stop()).toBe(0);
    expect(await Bun.file(path).exists()).toBe(false);
    expect(await stat(dir).catch(() => undefined)).toBeUndefined();
  });

  test("a stale socket file left by a dead server is removed on start", async () => {
    const dir = await mkdtemp(join(tmpdir(), "harness-hooks-stale-"));
    const path = join(dir, "hooks.sock");
    try {
      const first = spawnWithSocket(path);
      await Bun.sleep(600);
      first.kill("SIGKILL");
      await first.exited;
      expect((await stat(path)).isSocket()).toBe(true);
      const second = spawnWithSocket(path);
      let ok = "";
      for (let i = 0; i < 50 && ok !== "ok"; i++) {
        await Bun.sleep(100);
        const probe = Bun.spawn(["curl", "-s", "--unix-socket", path, "http://localhost/healthz"], { stdout: "pipe" });
        ok = await new Response(probe.stdout).text();
      }
      expect(ok).toBe("ok");
      second.kill("SIGTERM");
      await second.exited;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("a socket another server answers on, and a file that is not a socket, are not removed", async () => {
    const live = await startSocketServer();
    try {
      const clash = spawnWithSocket(live.socketPath);
      expect(await clash.exited).not.toBe(0);
      expect(await new Response(clash.stderr).text()).toContain("already served");
      expect((await stat(live.socketPath)).isSocket()).toBe(true);
      const file = join(live.dir, "plain");
      await writeFile(file, "keep me");
      const refused = spawnWithSocket(file);
      expect(await refused.exited).not.toBe(0);
      expect(await readFile(file, "utf8")).toBe("keep me");
    } finally {
      await live.stop();
    }
  });

  test(`${EnvVar.HookSocket} must be an absolute path`, async () => {
    const r = await refusesToStart({ [EnvVar.HookSocket]: "relative.sock" });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain(EnvVar.HookSocket);
  });

  test("loopback admission still applies to socket connections when no token is set", async () => {
    const srv = await startSocketServer();
    try {
      const post = async (...headers: string[]) => {
        const proc = Bun.spawn(["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "--unix-socket", srv.socketPath, "-X", "POST", ...headers.flatMap((h) => ["-H", h]), "--data-binary", "{}", "http://localhost/hook/claude"], { stdout: "pipe" });
        return new Response(proc.stdout).text();
      };
      expect(await post("content-type: application/json")).toBe("200");
      expect(await post("content-type: application/json", "host: evil.example")).toBe("403");
      expect(await post("content-type: text/plain")).toBe("415");
    } finally {
      await srv.stop();
    }
  });
});
