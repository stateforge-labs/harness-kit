import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { shimPath } from "@homelab/harness-hooks";
import { fixture as fixtureOf, variant } from "./kit.ts";
import { eventually, hookEnvNames, startServer, type RunningServer } from "./harness.ts";
import { EnvVar, processEnv } from "@homelab/harness-hooks";

const SHIM = shimPath;
const SECRET = "tok-shim-never-print-me";

interface ShimRun {
  code: number | null;
  stdout: string;
  stderr: string;
  ms: number;
}

async function runShim(opts: { args?: string[]; stdin: string; env?: Record<string, string>; deadlineMs?: number }): Promise<ShimRun> {
  const env: Record<string, string | undefined> = { ...processEnv() };
  for (const k of Object.keys(env)) if (hookEnvNames.has(k)) delete env[k];
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

const fixture = (event: string) => fixtureOf("claude", event);
const sessionStart = () => JSON.stringify(variant(fixture("SessionStart"), {}, `shim-${crypto.randomUUID()}`));
const NEVER_BLOCKS = [0, 1];

let open: RunningServer;
let guarded: RunningServer;
beforeAll(async () => {
  open = await startServer();
  guarded = await startServer({ [EnvVar.HookToken]: SECRET });
});
afterAll(async () => {
  await open.stop();
  await guarded.stop();
});

describe("e2e: the command-hook shim", () => {
  test("a Codex payload through --harness codex is logged as codex and answered {} (passive)", async () => {
    const body = variant(fixtureOf("codex", "SessionStart"), {}, `shim-${crypto.randomUUID()}`);
    const r = await runShim({ args: ["--harness", "codex"], stdin: JSON.stringify(body), env: { [EnvVar.HookUrl]: open.base } });
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({});
    const line = await eventually(async () => {
      const f = Bun.file(open.logFile);
      return ((await f.exists()) ? await f.text() : "").split("\n").find((l) => l.includes(body.session_id));
    });
    expect(line).toContain(`"harness":"codex"`);
  });

  test("prints the server's answer and exits 0", async () => {
    const r = await runShim({ stdin: sessionStart(), env: { [EnvVar.HookUrl]: open.base } });
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout) as { hookSpecificOutput?: { hookEventName?: string; additionalContext?: string } };
    expect(out.hookSpecificOutput?.hookEventName).toBe("SessionStart");
    expect(out.hookSpecificOutput?.additionalContext).toStartWith("Delegation rules");
  });

  test("an event the server answers {} prints {} (Codex needs a JSON object for some events)", async () => {
    const r = await runShim({ stdin: JSON.stringify(variant(fixture("PreCompact"))), env: { [EnvVar.HookUrl]: open.base } });
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({});
  });

  test("sends the token when one is set, and the guarded server then answers", async () => {
    const r = await runShim({ stdin: sessionStart(), env: { [EnvVar.HookUrl]: guarded.base, [EnvVar.HookToken]: SECRET } });
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(r.stdout + r.stderr).not.toContain(SECRET);
  });

  test("fails open when the server is not running: {} and exit 0", async () => {
    const r = await runShim({ stdin: sessionStart(), env: { [EnvVar.HookUrl]: "http://127.0.0.1:1", [EnvVar.HookToken]: SECRET, [EnvVar.ShimDebug]: "1" } });
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({});
    expect(r.stderr).toContain("server unreachable");
    expect(r.stdout + r.stderr).not.toContain(SECRET);
  });

  test("fails open when the server refuses the token (401), and does not print it", async () => {
    for (const env of <Record<string, string>[]>[{ [EnvVar.HookToken]: "wrong" }, {}]) {
      const r = await runShim({ stdin: sessionStart(), env: { [EnvVar.HookUrl]: guarded.base, [EnvVar.ShimDebug]: "1", ...env } });
      expect(r.code).toBe(0);
      expect(JSON.parse(r.stdout)).toEqual({});
      expect(r.stderr).toContain("server answered 401");
      expect(r.stdout + r.stderr).not.toContain(SECRET);
    }
  });

  test("fails open when the server answers an error status, such as 400 for a body that is not JSON", async () => {
    const r = await runShim({ stdin: "this is not json", env: { [EnvVar.HookUrl]: open.base, [EnvVar.ShimDebug]: "1" } });
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({});
    expect(r.stderr).toContain("server answered 400");
  });

  test("an empty stdin fails open too", async () => {
    const r = await runShim({ stdin: "", env: { [EnvVar.HookUrl]: open.base } });
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({});
  });

  test("a server that accepts the connection and never answers is given up on after the timeout", async () => {
    const sockets: unknown[] = [];
    const silent = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { open: (s) => void sockets.push(s), data() {}, close() {}, error() {} } });
    try {
      const r = await runShim({ stdin: sessionStart(), env: { [EnvVar.HookUrl]: `http://127.0.0.1:${silent.port}`, [EnvVar.ShimTimeoutMs]: "300", [EnvVar.ShimDebug]: "1" } });
      expect(r.code).toBe(0);
      expect(JSON.parse(r.stdout)).toEqual({});
      expect(r.stderr).toContain("timeout");
      expect(r.ms).toBeLessThan(5000);
    } finally {
      silent.stop(true);
    }
  });

  test("a server that answers something other than a JSON object fails open", async () => {
    for (const answer of ["plain text", "[1,2]", "null", ""]) {
      const odd = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response(answer) });
      try {
        const r = await runShim({ stdin: sessionStart(), env: { [EnvVar.HookUrl]: `http://127.0.0.1:${odd.port}` } });
        expect(r.code).toBe(0);
        expect(JSON.parse(r.stdout)).toEqual({});
      } finally {
        await odd.stop(true);
      }
    }
  });

  test("a call without a harness is a visible error (exit 1), never a block (exit 2)", async () => {
    for (const args of [[], ["--harness"], ["--harness", "../x"], ["--harness", "A B"]]) {
      const r = await runShim({ args, stdin: sessionStart(), env: { [EnvVar.HookUrl]: open.base } });
      expect(r.code).toBe(1);
      expect(r.stderr).toContain("usage:");
      expect(r.stdout).toBe("");
    }
  });

  test("no outcome above uses exit 2", async () => {
    const runs = await Promise.all([
      runShim({ stdin: sessionStart(), env: { [EnvVar.HookUrl]: open.base } }),
      runShim({ stdin: sessionStart(), env: { [EnvVar.HookUrl]: "http://127.0.0.1:1" } }),
      runShim({ stdin: "{", env: { [EnvVar.HookUrl]: open.base } }),
      runShim({ args: [], stdin: "{}", env: {} }),
    ]);
    for (const r of runs) expect(NEVER_BLOCKS).toContain(r.code as number);
  });

  test("a harness name the server does not know fails open (404)", async () => {
    const r = await runShim({ args: ["--harness", "nope"], stdin: sessionStart(), env: { [EnvVar.HookUrl]: open.base, [EnvVar.ShimDebug]: "1" } });
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({});
    expect(r.stderr).toContain("server answered 404");
  });
});
