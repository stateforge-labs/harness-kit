import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eventually, startServer, type RunningServer } from "../harness.ts";

// First payload line from a real headless run (captures/SessionEnd-1), replayed verbatim.
const CAPTURE = new URL(
  "../../../docs/research/studies/2026-11-07-claude-code-hook-surface/evidence/captures/SessionEnd-1/events.jsonl",
  import.meta.url,
).pathname;

const TOKEN = "t0k3n";
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

const logLines = async (sessionId: string) => {
  const f = Bun.file(srv.logFile);
  const text = (await f.exists()) ? await f.text() : "";
  const lines = text.split("\n").filter((l) => l.includes(`"session_id":"${sessionId}"`));
  return lines.length ? lines : undefined;
};

const base = {
  session_id: "end-1",
  transcript_path: "/home/dev/.claude/projects/p/transcript.jsonl",
  cwd: "/home/dev/project",
  hook_event_name: "SessionEnd",
  reason: "prompt_input_exit",
};

describe("e2e: SessionEnd", () => {
  test("a realistic payload gets an empty response", async () => {
    const res = await post(base);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  test("the response stays empty whatever the reason", async () => {
    const res = await post({ ...base, session_id: "end-r", reason: "other" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  test("the log line is known, has no missing keys, carries the reason, and no prompt or command text", async () => {
    await post({
      ...base,
      session_id: "end-2",
      reason: "clear",
      prompt: "SECRET-PROMPT-TEXT",
      message: "SECRET-MESSAGE-TEXT",
      tool_input: { command: "SECRET-COMMAND-TEXT" },
    });
    const lines = await eventually(() => logLines("end-2"));
    const entry = JSON.parse(lines[0]!);
    expect(entry.event).toBe("SessionEnd");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.reason).toBe("clear");
    const all = lines.join("\n");
    expect(all).not.toContain("SECRET-PROMPT-TEXT");
    expect(all).not.toContain("SECRET-MESSAGE-TEXT");
    expect(all).not.toContain("SECRET-COMMAND-TEXT");
  });

  test("a payload missing reason is still answered 200 and logged with it as missing", async () => {
    const payload: Record<string, unknown> = { ...base, session_id: "end-3" };
    delete payload.reason;
    const res = await post(payload);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const lines = await eventually(() => logLines("end-3"));
    const entry = JSON.parse(lines[0]!);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual(["reason"]);
  });
  test("a captured real payload is answered 200 with {} and logged known with no missing keys", async () => {
    const text = await Bun.file(CAPTURE).text();
    const first = JSON.parse(text.split("\n").find((l) => l.trim().length > 0)!);
    const captured = first.payload as Record<string, unknown>;
    const sessionId = captured.session_id as string;
    const res = await post(captured);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const lines = await eventually(() => logLines(sessionId));
    const entry = JSON.parse(lines[0]!);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.reason).toBe("other");
  });
});
