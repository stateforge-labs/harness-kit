import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { eventually, startServer, type RunningServer } from "../harness.ts";

// First payload from a real Claude Code run (capture PostToolUseFailure-2): Bash `ls ./nonexistent_dir`.
const CAPTURED = resolve(
  import.meta.dir,
  "../../..",
  "docs/research/studies/2026-11-07-claude-code-hook-surface/evidence/captures/PostToolUseFailure-2/events.jsonl",
);

const SECRET_CMD = "npm test SECRET-CMD-PTUF";
const SECRET_ERR = "SECRET-ERROR-BODY-PTUF";
let srv: RunningServer;

beforeAll(async () => {
  srv = await startServer();
});
afterAll(() => srv.stop());

const post = (body: unknown) =>
  fetch(`${srv.base}/hook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const common = (session_id: string) => ({
  session_id,
  transcript_path: "/home/user/.claude/projects/x/transcript.jsonl",
  cwd: "/home/user/project",
  permission_mode: "default",
  hook_event_name: "PostToolUseFailure",
});

const logLineFor = (session_id: string) =>
  eventually(async () => {
    const text = await Bun.file(srv.logFile).text().catch(() => "");
    const line = text.split("\n").find((l) => l.includes(`"session_id":"${session_id}"`));
    return line ? { text, entry: JSON.parse(line) as Record<string, unknown> } : undefined;
  });

describe("e2e: PostToolUseFailure", () => {
  test("a realistic payload gets an empty response", async () => {
    const res = await post({
      ...common("ptuf-1"),
      tool_name: "Bash",
      tool_input: { command: SECRET_CMD, description: "run tests" },
      tool_use_id: "toolu_ptuf1",
      error: `Exit code 1\n${SECRET_ERR}`,
      is_interrupt: false,
      duration_ms: 4187,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  test("the log is known, has no missing keys, records meta, and never the command or error text", async () => {
    const { text, entry } = await logLineFor("ptuf-1");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.tool_name).toBe("Bash");
    expect(entry.is_interrupt).toBe(false);
    expect(entry.duration_ms).toBe(4187);
    expect(entry.error_exit_code).toBe(1);
    expect(text).not.toContain("SECRET-CMD-PTUF");
    expect(text).not.toContain(SECRET_ERR);
  });

  test("a payload missing a required key is still answered 200 and logged with it in missing", async () => {
    const res = await post({
      ...common("ptuf-2"),
      tool_name: "Bash",
      tool_input: { command: SECRET_CMD },
      error: "Exit code 2",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const { entry } = await logLineFor("ptuf-2");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual(["tool_use_id"]);
  });

  test("an MCP tool failure logs the server name and source, not the tool input", async () => {
    await post({
      ...common("ptuf-3"),
      tool_name: "mcp__files__read",
      tool_input: { path: "SECRET-PATH-PTUF" },
      tool_use_id: "toolu_ptuf3",
      error: "Tool returned an error",
      mcp_server: { name: "files", source: "user" },
    });
    const { text, entry } = await logLineFor("ptuf-3");
    expect(entry.mcp_server_name).toBe("files");
    expect(entry.mcp_server_source).toBe("user");
    expect(entry.error_exit_code).toBeNull();
    expect(text).not.toContain("SECRET-PATH-PTUF");
  });

  test("passive for every tool, including an Agent call, with no decision or context fields", async () => {
    for (const tool_name of ["Agent", "Read"]) {
      const res = await post({
        ...common(`ptuf-4-${tool_name}`),
        tool_name,
        tool_input: { prompt: "Find all API endpoints" },
        tool_use_id: "toolu_ptuf4",
        error: "failed",
      });
      expect(await res.json()).toEqual({});
    }
  });

  test("replays the first captured payload from a real run: 200, empty response, known, no missing keys", async () => {
    const first = (await Bun.file(CAPTURED).text()).split("\n").find((l) => l.trim() !== "");
    expect(first).toBeDefined();
    const { payload } = JSON.parse(first!) as { payload: Record<string, unknown> };
    const res = await post(payload);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const { entry } = await logLineFor(payload.session_id as string);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.tool_name).toBe("Bash");
    expect(entry.error_exit_code).toBe(2);
  });
});
