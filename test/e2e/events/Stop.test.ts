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

const logLineFor = (sessionId: string) =>
  eventually(async () => {
    const f = Bun.file(srv.logFile);
    const text = (await f.exists()) ? await f.text() : "";
    return text.split("\n").find((l) => l.includes(`"session_id":"${sessionId}"`));
  });

const common = (sessionId: string) => ({
  session_id: sessionId,
  transcript_path: "/home/user/.claude/projects/x/transcript.jsonl",
  cwd: "/home/user/project",
  hook_event_name: "Stop",
  permission_mode: "default",
});

describe("e2e: Stop", () => {
  test("a realistic payload is answered with an empty response", async () => {
    const res = await post({
      ...common("stop1"),
      stop_hook_active: false,
      last_assistant_message: "I've completed the refactoring. Here's a summary...",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  test("the log line is known, has no missing keys, records meta, and no message text", async () => {
    await post({
      ...common("stop2"),
      stop_hook_active: true,
      last_assistant_message: "STOP-SECRET-MESSAGE",
      prompt: "STOP-SECRET-PROMPT",
    });
    const entry = JSON.parse((await logLineFor("stop2"))!);
    expect(entry.event).toBe("Stop");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.stop_hook_active).toBe(true);
    expect(entry.permission_mode).toBe("default");
    expect(entry.message_length).toBe("STOP-SECRET-MESSAGE".length);
    const line = await logLineFor("stop2");
    expect(line).not.toContain("STOP-SECRET-MESSAGE");
    expect(line).not.toContain("STOP-SECRET-PROMPT");
  });

  test("a payload missing a required key is still answered 200 and logged with it in missing", async () => {
    const res = await post({ ...common("stop3"), stop_hook_active: false });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const entry = JSON.parse((await logLineFor("stop3"))!);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual(["last_assistant_message"]);
  });

  test("never injects context or blocks, even when the message asks for a return format", async () => {
    const res = await post({
      ...common("stop4"),
      stop_hook_active: false,
      last_assistant_message: "Please return the answer in 50 words.",
    });
    expect(await res.json()).toEqual({});
  });
});
