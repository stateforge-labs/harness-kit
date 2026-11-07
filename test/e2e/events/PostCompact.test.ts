import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { eventually, startServer, type RunningServer } from "../harness.ts";

const SUMMARY = "SUMMARY-SECRET-CONTENT";
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
  session_id: "pc-1",
  transcript_path: "/home/user/.claude/projects/x/pc-1.jsonl",
  cwd: "/home/user/work",
  hook_event_name: "PostCompact",
};

describe("e2e: PostCompact", () => {
  test("a full payload gets an empty passive response", async () => {
    const res = await post({ ...commonFields, trigger: "auto", compact_summary: SUMMARY });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  test("the log keeps trigger and never the summary text", async () => {
    const entry = await logLineFor("pc-1");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.trigger).toBe("auto");
    expect(entry.compact_summary).toBeUndefined();
    expect(JSON.stringify(entry)).not.toContain(SUMMARY);
    expect(await readLog()).not.toContain(SUMMARY);
  });

  test("a payload missing a required key is still answered 200 and logged as missing", async () => {
    const res = await post({ ...commonFields, session_id: "pc-2", trigger: "manual" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const entry = await logLineFor("pc-2");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual(["compact_summary"]);
    expect(entry.trigger).toBe("manual");
  });

  test("the response stays empty even when the payload carries an unsupported output field", async () => {
    const res = await post({ ...commonFields, session_id: "pc-3", trigger: "auto", compact_summary: SUMMARY, continue: false });
    expect(await res.json()).toEqual({});
  });
});

// Real captured PostCompact payloads. Each capture's lines may include PreCompact, so the replay
// takes the first line whose hook_event_name is PostCompact.
const CAPTURES = join(
  import.meta.dir,
  "../../../docs/research/studies/2026-11-07-claude-code-hook-surface/evidence/captures",
);
const capturedPayload = async (dir: string): Promise<Record<string, unknown>> => {
  const lines = (await Bun.file(join(CAPTURES, dir, "events.jsonl")).text()).split("\n").filter((l) => l.trim() !== "");
  for (const line of lines) {
    const payload = (JSON.parse(line) as { payload: Record<string, unknown> }).payload;
    if (payload.hook_event_name === "PostCompact") return payload;
  }
  throw new Error(`no PostCompact payload in capture ${dir}`);
};

describe("e2e: PostCompact captured replay", () => {
  // PostCompact-2: real manual /compact payload.
  test("a real captured manual PostCompact payload is answered {} and logged with no missing keys", async () => {
    const payload = await capturedPayload("PostCompact-2");
    const sid = String(payload.session_id);
    const res = await post(payload);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const entry = await logLineFor(sid);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.trigger).toBe("manual");
    expect(entry.compact_summary).toBeUndefined();
    expect(await readLog()).not.toContain(String(payload.compact_summary).slice(0, 80));
  });

  // PostCompact-4: real auto-compact payload (CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=1).
  test("a real captured auto PostCompact payload is answered {} and logged with trigger auto", async () => {
    const payload = await capturedPayload("PostCompact-4");
    const sid = String(payload.session_id);
    const res = await post(payload);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const entry = await logLineFor(sid);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.trigger).toBe("auto");
    expect(entry.compact_summary).toBeUndefined();
    expect(await readLog()).not.toContain(String(payload.compact_summary).slice(0, 80));
  });
});
