import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { resolve } from "node:path";
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

const logLineFor = (sessionId: string) =>
  eventually(async () => {
    const text = await Bun.file(srv.logFile).text().catch(() => "");
    return text.split("\n").find((l) => l.includes(`"session_id":"${sessionId}"`));
  });

const common = (sessionId: string) => ({
  session_id: sessionId,
  transcript_path: "/home/user/.claude/projects/x/transcript.jsonl",
  cwd: "/home/user/project",
  hook_event_name: "TaskCompleted",
});

const required = { task_id: "task-001", task_subject: "Implement user authentication" };

describe("e2e: TaskCompleted", () => {
  test("a realistic payload gets an empty response (passive, never blocks)", async () => {
    const res = await post({
      ...common("tc1"),
      ...required,
      task_description: "Add login and signup endpoints",
      teammate_name: "implementer",
      team_name: "session-a1b2c3d4",
      agent_id: "agent-tc-1",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  test("the log line is known, has no missing keys, records teammate and agent meta, and no payload text", async () => {
    await post({
      ...common("tc2"),
      ...required,
      task_description: "TASK-SECRET-DESCRIPTION",
      teammate_name: "implementer",
      agent_id: "agent-tc-2",
      prompt: "TASK-SECRET-PROMPT",
      tool_input: { command: "TASK-SECRET-CMD" },
      message: "TASK-SECRET-MESSAGE",
    });
    const line = await logLineFor("tc2");
    const entry = JSON.parse(line!);
    expect(entry.event).toBe("TaskCompleted");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.teammate_name).toBe("implementer");
    expect(entry.agent_id).toBe("agent-tc-2");
    expect(line).not.toContain("TASK-SECRET-DESCRIPTION");
    expect(line).not.toContain("TASK-SECRET-PROMPT");
    expect(line).not.toContain("TASK-SECRET-CMD");
    expect(line).not.toContain("TASK-SECRET-MESSAGE");
  });

  test("a payload missing task_subject is still answered 200 with {} and logged with task_subject in missing", async () => {
    const res = await post({ ...common("tc3"), task_id: "task-003" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const entry = JSON.parse((await logLineFor("tc3"))!);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual(["task_subject"]);
  });

  test("a completion triggered by TaskUpdate, or a teammate stop with continue semantics, still gets {} with no blocking fields", async () => {
    const res = await post({ ...common("tc4"), ...required, tool_name: "TaskUpdate", teammate_name: "reviewer" });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({});
    expect(body.continue).toBeUndefined();
    expect(body.decision).toBeUndefined();
    expect(body.hookSpecificOutput).toBeUndefined();
  });

  test("the TaskUpdate-path payload from capture 7, which carried a continue:false reply, is still answered with {} and is known", async () => {
    const capturePath = resolve(
      import.meta.dir,
      "../../../docs/research/studies/2026-11-07-claude-code-hook-surface/evidence/captures/TaskCompleted-7/events.jsonl",
    );
    const captured = (await Bun.file(capturePath).text())
      .split("\n")
      .filter((l) => l.trim() !== "")
      .map((l) => JSON.parse(l) as { payload: Record<string, unknown> })
      .find((e) => e.payload.hook_event_name === "TaskCompleted");
    expect(captured).toBeDefined();
    const sessionId = String(captured!.payload.session_id);

    const res = await post(captured!.payload);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const entry = JSON.parse((await logLineFor(sessionId))!);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
  });

  test("a payload replayed from a real capture (first TaskCompleted line) gets {} and is known with no missing keys", async () => {
    const capturePath = resolve(
      import.meta.dir,
      "../../../docs/research/studies/2026-11-07-claude-code-hook-surface/evidence/captures/TaskCompleted-3/events.jsonl",
    );
    const lines = (await Bun.file(capturePath).text()).split("\n").filter((l) => l.trim() !== "");
    // Line 1 of this capture is a TaskCreated payload, so take the first TaskCompleted line.
    const captured = lines
      .map((l) => JSON.parse(l) as { ts: string; payload: Record<string, unknown> })
      .find((e) => e.payload.hook_event_name === "TaskCompleted");
    expect(captured).toBeDefined();
    const sessionId = String(captured!.payload.session_id);

    const res = await post(captured!.payload);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const entry = JSON.parse((await logLineFor(sessionId))!);
    expect(entry.event).toBe("TaskCompleted");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
  });
});
