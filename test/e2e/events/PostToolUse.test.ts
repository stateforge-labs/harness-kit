import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eventually, startServer, type RunningServer } from "../harness.ts";

const TOKEN = "t0k3n";
const SECRET_CMD = "cat SECRET-FILE-PT7";
const SECRET_OUT = "OUTPUT-BODY-PT7";
let srv: RunningServer;

beforeAll(async () => {
  srv = await startServer({ HOOK_TOKEN: TOKEN });
});
afterAll(() => srv.stop());

const post = (body: unknown) =>
  fetch(`${srv.base}/hook`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(body),
  });

const common = (session_id: string) => ({
  session_id,
  transcript_path: "/tmp/transcript.jsonl",
  cwd: "/work",
  permission_mode: "default",
  hook_event_name: "PostToolUse",
});

/** Wait for the log line of one session and return the raw text plus the parsed line. */
async function logLineFor(session_id: string) {
  return eventually(async () => {
    const text = await Bun.file(srv.logFile).text().catch(() => "");
    const line = text.split("\n").find((l) => l.includes(`"session_id":"${session_id}"`));
    return line ? { text, line: JSON.parse(line) as Record<string, unknown> } : undefined;
  });
}

describe("e2e: PostToolUse", () => {
  test("a full payload gets an empty response", async () => {
    const res = await post({
      ...common("ptu-1"),
      tool_name: "Bash",
      tool_input: { command: SECRET_CMD, description: "read it" },
      tool_response: { stdout: SECRET_OUT, stderr: "", interrupted: false },
      tool_use_id: "toolu_01",
      duration_ms: 42,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  test("the log records known, no missing keys and meta, but never the command or output", async () => {
    const { text, line } = await logLineFor("ptu-1");
    expect(line.known).toBe(true);
    expect(line.missing).toEqual([]);
    expect(line.tool_name).toBe("Bash");
    expect(line.duration_ms).toBe(42);
    expect(line.permission_mode).toBe("default");
    expect(text).not.toContain("SECRET-FILE-PT7");
    expect(text).not.toContain(SECRET_OUT);
  });

  test("a payload missing a required key is still answered and logged with it in missing", async () => {
    const res = await post({
      ...common("ptu-2"),
      tool_name: "Bash",
      tool_input: { command: SECRET_CMD },
      tool_use_id: "toolu_02",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const { line } = await logLineFor("ptu-2");
    expect(line.known).toBe(true);
    expect(line.missing).toEqual(["tool_response"]);
  });

  test("an Agent call without a return format gets no context, since the review is PreToolUse only", async () => {
    const res = await post({
      ...common("ptu-3"),
      tool_name: "Agent",
      tool_input: { prompt: "Find all API endpoints", model: "sonnet" },
      tool_response: { status: "completed", agentId: "a1", content: [] },
      tool_use_id: "toolu_03",
    });
    expect(await res.json()).toEqual({});
  });

  test("an MCP tool logs its server name as meta", async () => {
    await post({
      ...common("ptu-4"),
      tool_name: "mcp__gitlab__get_project",
      tool_input: { project_id: "group%2Fproject" },
      tool_response: { content: [] },
      tool_use_id: "toolu_04",
      mcp_server: { name: "gitlab", source: "user" },
    });
    const { text, line } = await logLineFor("ptu-4");
    expect(line.mcp_server).toBe("gitlab");
    expect(text).not.toContain("group%2Fproject");
  });
});

describe("e2e: PostToolUse captured payload", () => {
  const CAPTURE = `${import.meta.dir}/../../../docs/research/studies/2026-11-07-claude-code-hook-surface/evidence/captures/PostToolUse-1/events.jsonl`;
  let cap: RunningServer;
  let payload: Record<string, unknown> = {};

  beforeAll(async () => {
    cap = await startServer({ HOOK_TOKEN: TOKEN });
    // The first line is PreToolUse, so take the first real PostToolUse payload from the capture.
    const lines = (await Bun.file(CAPTURE).text()).split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const first = lines.find((l) => l.payload.hook_event_name === "PostToolUse");
    if (!first) throw new Error("no PostToolUse payload in capture");
    payload = first.payload;
  });
  afterAll(() => cap.stop());

  test("a captured PostToolUse payload gets an empty 200 response", async () => {
    const res = await fetch(`${cap.base}/hook`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify(payload),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  test("the log marks the captured payload known with no missing keys", async () => {
    const line = await eventually(async () => {
      const text = await Bun.file(cap.logFile).text().catch(() => "");
      const hit = text.split("\n").find((l) => l.includes(`"session_id":"${payload.session_id}"`));
      return hit ? (JSON.parse(hit) as Record<string, unknown>) : undefined;
    });
    expect(line.known).toBe(true);
    expect(line.missing).toEqual([]);
  });
});
