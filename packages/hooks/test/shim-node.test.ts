import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { shimPath } from "../src/paths.ts";
import { EnvVar, processEnv } from "../src/env.ts";

let server: ReturnType<typeof Bun.serve>;
let seen: { path: string; body: string } | undefined;

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(req) {
      seen = { path: new URL(req.url).pathname, body: await req.text() };
      return Response.json({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "from stub" } });
    },
  });
});
afterAll(() => server.stop(true));

async function runNode(url: string, payload: string) {
  const proc = Bun.spawn(["node", shimPath, "--harness", "codex"], {
    env: { [EnvVar.Path]: processEnv()[EnvVar.Path] ?? "", [EnvVar.HookUrl]: url, [EnvVar.ShimTimeoutMs]: "1500" },
    stdin: new Blob([payload]),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return { code: await proc.exited, stdout, stderr };
}

describe("shim under Node", () => {
  test("posts stdin to /hook/<harness> and prints the server's answer", async () => {
    const payload = JSON.stringify({ hook_event_name: "SessionStart", session_id: "s1" });
    const r = await runNode(`http://127.0.0.1:${server.port}`, payload);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe("");
    expect(JSON.parse(r.stdout)).toEqual({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "from stub" } });
    expect(seen).toEqual({ path: "/hook/codex", body: payload });
  });

  test("fails open with {} when nothing listens", async () => {
    const r = await runNode("http://127.0.0.1:9", "{}");
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("{}");
  });
});
