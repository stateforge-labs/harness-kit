// The command-hook shim in HOOK_SHIM_FAIL=closed mode, run as a real process against a real server or a closed port.
// A down, slow, unauthorised or odd server gets a refusal on PreToolUse and PermissionRequest and {} on every other event.
// A healthy server's answer passes through unchanged. All over HTTP and process stdout: the shim is a process by design, so no in-process tests.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { shimPath } from "@homelab/harness-hooks";
import { fixture as fixtureOf, variant } from "./kit.ts";
import { startServer, type RunningServer } from "./harness.ts";

const SHIM = shimPath;

// The default refusal text lives in the shim source; read it, do not copy it.
const DEFAULT_REASON = /const DEFAULT_DENY_REASON = "([^"]*)";/.exec(readFileSync(SHIM, "utf8"))?.[1];
if (!DEFAULT_REASON) throw new Error("could not find DEFAULT_DENY_REASON in the shim source");

interface ShimRun {
  code: number | null;
  stdout: string;
  stderr: string;
  ms: number;
}

/** Runs the real shim as a process with a payload on stdin. Killed at the deadline, which shows up as code null. */
async function runShim(opts: { args?: string[]; stdin: string; env?: Record<string, string>; deadlineMs?: number }): Promise<ShimRun> {
  const env: Record<string, string | undefined> = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith("HOOK_")) delete env[k];
  const started = performance.now();
  const proc = Bun.spawn(["bun", SHIM, ...(opts.args ?? ["--harness", "claude"])], {
    env: { ...env, ...opts.env },
    stdin: new TextEncoder().encode(opts.stdin),
    stdout: "pipe",
    stderr: "pipe",
  });
  const timer = setTimeout(() => proc.kill(), opts.deadlineMs ?? 10_000);
  const code = await proc.exited;
  clearTimeout(timer);
  return {
    code: proc.signalCode ? null : code,
    stdout: await new Response(proc.stdout).text(),
    stderr: await new Response(proc.stderr).text(),
    ms: performance.now() - started,
  };
}

/** A loopback port with nothing listening on it: bind an ephemeral one, then release it. */
function closedUrl(): string {
  const l = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { open() {}, data() {}, close() {}, error() {} } });
  const port = l.port;
  l.stop(true);
  return `http://127.0.0.1:${port}`;
}

const payload = (event: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ hook_event_name: event, session_id: `shim-closed-${crypto.randomUUID()}`, ...extra });
const preToolUse = () => payload("PreToolUse", { tool_name: "Bash", tool_input: { command: "ls" } });
const permissionRequest = () => payload("PermissionRequest", { tool_name: "Bash", tool_input: { command: "ls" } });

const denyPre = (reason: string) => ({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } });
const denyPerm = (reason: string) => ({ hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "deny", message: reason } } });

const closed = (url: string, extra: Record<string, string> = {}) => ({ HOOK_URL: url, HOOK_SHIM_FAIL: "closed", ...extra });

const SECRET = `tok-${crypto.randomUUID()}`;
let guarded: RunningServer;
let healthy: RunningServer;
beforeAll(async () => {
  healthy = await startServer();
  guarded = await startServer({ HOOK_TOKEN: SECRET });
});
afterAll(async () => {
  await healthy.stop();
  await guarded.stop();
});

describe("e2e: the command-hook shim, fail closed", () => {
  test("a down server refuses PreToolUse with the default reason, for codex and claude, exit 0", async () => {
    const url = closedUrl();
    for (const harness of ["codex", "claude"]) {
      const r = await runShim({ args: ["--harness", harness], stdin: preToolUse(), env: closed(url) });
      expect(r.code).toBe(0);
      expect(JSON.parse(r.stdout)).toEqual(denyPre(DEFAULT_REASON));
    }
  });

  test("a down server refuses PermissionRequest with decision.behavior deny and the default reason", async () => {
    const r = await runShim({ args: ["--harness", "codex"], stdin: permissionRequest(), env: closed(closedUrl()) });
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual(denyPerm(DEFAULT_REASON));
  });

  test("a down server answers Stop and SessionStart with {} even in closed mode", async () => {
    const url = closedUrl();
    for (const event of ["Stop", "SessionStart"]) {
      const r = await runShim({ args: ["--harness", "codex"], stdin: payload(event), env: closed(url) });
      expect(r.code).toBe(0);
      expect(JSON.parse(r.stdout)).toEqual({});
    }
  });

  test("stdin that is not JSON gets {} in closed mode, exit 0", async () => {
    const r = await runShim({ stdin: "this is not json", env: closed(closedUrl()) });
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({});
  });

  test("HOOK_SHIM_DENY_REASON replaces the default text on both refusal shapes", async () => {
    const reason = "custom refusal text for the test";
    const env = closed(closedUrl(), { HOOK_SHIM_DENY_REASON: reason });
    const pre = await runShim({ stdin: preToolUse(), env });
    expect(pre.code).toBe(0);
    expect(JSON.parse(pre.stdout)).toEqual(denyPre(reason));
    const perm = await runShim({ stdin: permissionRequest(), env });
    expect(perm.code).toBe(0);
    expect(JSON.parse(perm.stdout)).toEqual(denyPerm(reason));
  });

  test("with HOOK_SHIM_DEBUG=1 stderr says failing closed and never shows the token", async () => {
    const r = await runShim({ stdin: preToolUse(), env: closed(closedUrl(), { HOOK_TOKEN: SECRET, HOOK_SHIM_DEBUG: "1" }) });
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual(denyPre(DEFAULT_REASON));
    expect(r.stderr).toContain("failing closed");
    expect(r.stdout + r.stderr).not.toContain(SECRET);
  });

  test("a server that refuses the token (401) fails closed, with and without the token, and never prints it", async () => {
    for (const token of ["wrong-token", undefined]) {
      const env = closed(guarded.base, { HOOK_SHIM_DEBUG: "1", ...(token ? { HOOK_TOKEN: token } : {}) });
      const r = await runShim({ stdin: preToolUse(), env });
      expect(r.code).toBe(0);
      expect(JSON.parse(r.stdout)).toEqual(denyPre(DEFAULT_REASON));
      expect(r.stderr).toContain("failing closed");
      expect(r.stderr).toContain("server answered 401");
      expect(r.stdout + r.stderr).not.toContain(SECRET);
    }
  });

  test("a server that rejects the real token with 401 fails closed and the token is never printed", async () => {
    const srv = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("no", { status: 401 }) });
    try {
      const r = await runShim({ stdin: preToolUse(), env: closed(`http://127.0.0.1:${srv.port}`, { HOOK_TOKEN: SECRET, HOOK_SHIM_DEBUG: "1" }) });
      expect(r.code).toBe(0);
      expect(JSON.parse(r.stdout)).toEqual(denyPre(DEFAULT_REASON));
      expect(r.stderr).toContain("failing closed");
      expect(r.stdout + r.stderr).not.toContain(SECRET);
    } finally {
      await srv.stop(true);
    }
  });

  test("a slow server past HOOK_SHIM_TIMEOUT_MS=300 fails closed well before its 2 s answer", async () => {
    const slow = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch() {
        await Bun.sleep(2000);
        return new Response("{}", { headers: { "content-type": "application/json" } });
      },
    });
    try {
      const r = await runShim({ stdin: preToolUse(), env: closed(`http://127.0.0.1:${slow.port}`, { HOOK_SHIM_TIMEOUT_MS: "300", HOOK_SHIM_DEBUG: "1" }) });
      expect(r.code).toBe(0);
      expect(JSON.parse(r.stdout)).toEqual(denyPre(DEFAULT_REASON));
      expect(r.stderr).toContain("timeout");
      expect(r.ms).toBeLessThan(1800);
    } finally {
      await slow.stop(true);
    }
  });

  test("a server answer that is not a JSON object fails closed on PreToolUse", async () => {
    for (const answer of ["plain text", "[1,2]"]) {
      const odd = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response(answer) });
      try {
        const r = await runShim({ stdin: preToolUse(), env: closed(`http://127.0.0.1:${odd.port}`) });
        expect(r.code).toBe(0);
        expect(JSON.parse(r.stdout)).toEqual(denyPre(DEFAULT_REASON));
      } finally {
        await odd.stop(true);
      }
    }
  });

  test("a healthy real server's answer passes through unchanged in closed mode (codex PreToolUse fixture gives {})", async () => {
    const body = variant(fixtureOf("codex", "PreToolUse"), {}, `shim-closed-${crypto.randomUUID()}`);
    const r = await runShim({ args: ["--harness", "codex"], stdin: JSON.stringify(body), env: closed(healthy.base) });
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({});
  });

  test("a healthy server's own deny passes through unchanged, not replaced by the default reason", async () => {
    const own = denyPre("the server says no");
    const srv = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => Response.json(own) });
    try {
      const r = await runShim({ stdin: preToolUse(), env: closed(`http://127.0.0.1:${srv.port}`) });
      expect(r.code).toBe(0);
      expect(JSON.parse(r.stdout)).toEqual(own);
    } finally {
      await srv.stop(true);
    }
  });

  test("the default mode (no HOOK_SHIM_FAIL) fails open on a down server: PreToolUse and PermissionRequest give {}", async () => {
    const url = closedUrl();
    for (const stdin of [preToolUse(), permissionRequest()]) {
      const r = await runShim({ stdin, env: { HOOK_URL: url } });
      expect(r.code).toBe(0);
      expect(JSON.parse(r.stdout)).toEqual({});
    }
  });
});
