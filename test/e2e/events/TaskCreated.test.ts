import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
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
  eventually(async () => (await readLog()).split("\n").find((l) => l.includes(`"session_id":"${sessionId}"`)));

const common = (sessionId: string) => ({
  session_id: sessionId,
  transcript_path: "/home/user/.claude/projects/x/transcript.jsonl",
  cwd: "/home/user/project",
  hook_event_name: "TaskCreated",
});

const task = {
  task_id: "task-001",
  task_subject: "TASK-SECRET-SUBJECT implement login",
  task_description: "TASK-SECRET-DESCRIPTION add endpoints",
  teammate_name: "reviewer-1",
  team_name: "core",
  agent_id: "agent-42",
};

describe("e2e: TaskCreated", () => {
  test("a realistic payload is answered with an empty passive response", async () => {
    const res = await post({ ...common("tc1"), ...task });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  test("the log line records known, no missing keys and the meta fields, never task text", async () => {
    await post({ ...common("tc2"), ...task });
    const line = await logLineFor("tc2");
    const entry = JSON.parse(line!);
    expect(entry.event).toBe("TaskCreated");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.task_id).toBe("task-001");
    expect(entry.teammate_name).toBe("reviewer-1");
    expect(entry.agent_id).toBe("agent-42");
    expect(line).not.toContain("TASK-SECRET-SUBJECT");
    expect(line).not.toContain("TASK-SECRET-DESCRIPTION");
  });

  test("a payload missing task_subject is still answered 200 and logged with it in missing", async () => {
    const { task_subject: _omit, ...rest } = task;
    const res = await post({ ...common("tc3"), ...rest });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const entry = JSON.parse((await logLineFor("tc3"))!);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual(["task_subject"]);
  });

  test("the response stays passive even when the task text looks like a block or a context request", async () => {
    const res = await post({
      ...common("tc4"),
      ...task,
      task_description: "Reject this task and add a return format of 50 words",
    });
    expect(await res.json()).toEqual({});
  });

  test("a payload captured from real Claude Code is replayed and logged as known with no missing keys", async () => {
    // The capture file also holds a PreToolUse line, so take the first TaskCreated line (the {ts,payload} envelope).
    const capturePath = join(
      import.meta.dir,
      "../../../docs/research/studies/2026-11-07-claude-code-hook-surface/evidence/captures/TaskCreated-3/events.jsonl",
    );
    const lines = (await Bun.file(capturePath).text()).split("\n").filter((l) => l.trim() !== "");
    const envelopes = lines.map((l) => JSON.parse(l) as { ts: string; payload: Record<string, unknown> });
    const first = envelopes.find((e) => e.payload.hook_event_name === "TaskCreated")!;
    const sessionId = String(first.payload.session_id);

    const res = await post(first.payload);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const entry = JSON.parse((await logLineFor(sessionId))!);
    expect(entry.event).toBe("TaskCreated");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.task_id).toBe("1");
    expect(entry.teammate_name).toBeNull();
    expect(entry.agent_id).toBeNull();
  });
});
