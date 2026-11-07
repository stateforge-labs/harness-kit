import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eventually, startServer, type RunningServer } from "../harness.ts";

const PROMPT = "WORKTREE-REMOVE-SECRET-PROMPT";
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
    return line ? (JSON.parse(line) as Record<string, unknown>) : undefined;
  });

const commonFields = {
  session_id: "wr-1",
  transcript_path: "/home/user/.claude/projects/x/wr-1.jsonl",
  cwd: "/home/user/project",
  hook_event_name: "WorktreeRemove",
};

const worktreePath = "/home/user/project/.claude/worktrees/feature-auth";

describe("e2e: WorktreeRemove", () => {
  test("a realistic payload gets an empty passive response", async () => {
    const res = await post({ ...commonFields, worktree_path: worktreePath });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  test("the log line is known, has no missing keys, and no payload text", async () => {
    await post({ ...commonFields, session_id: "wr-2", worktree_path: worktreePath, prompt: PROMPT });
    const entry = await logLineFor("wr-2");
    expect(entry.event).toBe("WorktreeRemove");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(JSON.stringify(entry)).not.toContain(PROMPT);
    expect(await readLog()).not.toContain(PROMPT);
  });

  test("a payload missing worktree_path is still answered 200 and logged with worktree_path in missing", async () => {
    const res = await post({ ...commonFields, session_id: "wr-3" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const entry = await logLineFor("wr-3");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual(["worktree_path"]);
  });

  test("stays passive even with extra fields: no decision, no permission change, no context", async () => {
    const res = await post({
      ...commonFields,
      session_id: "wr-4",
      worktree_path: worktreePath,
      decision: "block",
      continue: false,
      hookSpecificOutput: { hookEventName: "WorktreeRemove", additionalContext: "x" },
    });
    expect(await res.json()).toEqual({});
  });
});
