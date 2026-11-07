import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eventually, startServer, type RunningServer } from "../harness.ts";

const PROMPT = "WORKTREE-SECRET-PROMPT";
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
  session_id: "wc-1",
  transcript_path: "/home/user/.claude/projects/x/wc-1.jsonl",
  cwd: "/home/user/project",
  hook_event_name: "WorktreeCreate",
};

describe("e2e: WorktreeCreate", () => {
  test("a realistic payload gets an empty passive response", async () => {
    const res = await post({ ...commonFields, name: "bold-oak-a3f2" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  test("the log line is known, has no missing keys, records the name, and no payload text", async () => {
    await post({ ...commonFields, session_id: "wc-2", name: "calm-pine-b7c1", prompt: PROMPT });
    const entry = await logLineFor("wc-2");
    expect(entry.event).toBe("WorktreeCreate");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.name).toBe("calm-pine-b7c1");
    expect(JSON.stringify(entry)).not.toContain(PROMPT);
    expect(await readLog()).not.toContain(PROMPT);
  });

  test("a payload missing name is still answered 200 and logged with name in missing", async () => {
    const res = await post({ ...commonFields, session_id: "wc-3" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const entry = await logLineFor("wc-3");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual(["name"]);
  });

  test("never returns hookSpecificOutput or decision fields, even with a worktreePath-like input", async () => {
    const res = await post({ ...commonFields, session_id: "wc-4", name: "swift-fox-d9e8", worktreePath: "/tmp/x" });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({});
  });

  test("replaying the first captured WorktreeCreate payload gets 200 {} and is known with no missing keys", async () => {
    const capturePath = `${import.meta.dir}/../../../docs/research/studies/2026-11-07-claude-code-hook-surface/evidence/captures/WorktreeCreate-1/events.jsonl`;
    const firstLine = (await Bun.file(capturePath).text()).split("\n").find((l) => l.trim() !== "");
    expect(firstLine).toBeDefined();
    const { payload } = JSON.parse(firstLine as string) as { ts: string; payload: Record<string, unknown> };
    const sessionId = payload.session_id as string;

    const res = await post(payload);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});

    const entry = await logLineFor(sessionId);
    expect(entry.event).toBe("WorktreeCreate");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.name).toBe("myfeat");
  });
});
