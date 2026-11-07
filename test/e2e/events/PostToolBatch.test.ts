import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eventually, startServer, type RunningServer } from "../harness.ts";

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

const readLog = async () => {
  const f = Bun.file(srv.logFile);
  return (await f.exists()) ? await f.text() : "";
};

const logLineFor = (sessionId: string) =>
  eventually(async () => {
    const line = (await readLog()).split("\n").find((l) => l.includes(`"session_id":"${sessionId}"`));
    return line;
  });

const common = (sessionId: string) => ({
  session_id: sessionId,
  transcript_path: "/home/user/.claude/projects/x/transcript.jsonl",
  cwd: "/home/user/project",
  hook_event_name: "PostToolBatch",
});

const toolCalls = [
  {
    tool_name: "Read",
    tool_input: { file_path: "/home/user/project/src/a.ts" },
    tool_use_id: "toolu_01",
    tool_response: "1\tPRIVATE-FILE-CONTENT",
  },
  {
    tool_name: "Agent",
    tool_input: { prompt: "BRIEF-SECRET-TEXT find the endpoints", description: "Find endpoints", subagent_type: "Explore" },
    tool_use_id: "toolu_02",
    tool_response: { status: "completed", content: [{ type: "text", text: "RESULT-SECRET-TEXT" }] },
  },
];

describe("e2e: PostToolBatch", () => {
  test("a realistic batch is answered with an empty passive response", async () => {
    const res = await post({ ...common("ptb1"), permission_mode: "default", tool_calls: toolCalls });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  test("the log line records known, no missing keys and the count and tool names, never payload text", async () => {
    await post({ ...common("ptb2"), tool_calls: toolCalls });
    const line = await logLineFor("ptb2");
    const entry = JSON.parse(line!);
    expect(entry.event).toBe("PostToolBatch");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.tool_calls).toBe(2);
    expect(entry.tool_names).toBe("Read,Agent");
    expect(line).not.toContain("BRIEF-SECRET-TEXT");
    expect(line).not.toContain("PRIVATE-FILE-CONTENT");
    expect(line).not.toContain("RESULT-SECRET-TEXT");
  });

  test("a payload missing tool_calls is still answered 200 and logged with tool_calls in missing", async () => {
    const res = await post(common("ptb3"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const entry = JSON.parse((await logLineFor("ptb3"))!);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual(["tool_calls"]);
  });

  test("an Agent call with no return format stays passive, since the Agent review belongs to PreToolUse", async () => {
    const res = await post({
      ...common("ptb4"),
      tool_calls: [
        {
          tool_name: "Agent",
          tool_input: { prompt: "Find all API endpoints", model: "opus" },
          tool_use_id: "toolu_03",
          tool_response: { status: "completed" },
        },
      ],
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });
});
