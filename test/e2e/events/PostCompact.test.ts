import { afterAll, beforeAll, describe, expect, test } from "bun:test";
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
