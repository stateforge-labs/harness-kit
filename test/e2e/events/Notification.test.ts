import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eventually, startServer, type RunningServer } from "../harness.ts";

let srv: RunningServer;

beforeAll(async () => {
  srv = await startServer({ HOOK_TOKEN: "" });
});
afterAll(() => srv.stop());

const post = (body: unknown) =>
  fetch(`${srv.base}/hook`, { method: "POST", body: JSON.stringify(body) });

const logLine = (sessionId: string) =>
  eventually(async () => {
    const f = Bun.file(srv.logFile);
    if (!(await f.exists())) return undefined;
    const line = (await f.text())
      .split("\n")
      .find((l) => l.includes(`"session_id":"${sessionId}"`));
    return line ?? undefined;
  });

describe("e2e: Notification", () => {
  test("a realistic payload is answered with an empty object", async () => {
    const res = await post({
      session_id: "notif-a",
      transcript_path: "/tmp/x.jsonl",
      cwd: "/work",
      hook_event_name: "Notification",
      message: "SECRET-NOTIFY-TEXT Claude needs your permission",
      title: "SECRET-NOTIFY-TITLE",
      notification_type: "permission_prompt",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  test("the log line is known, nothing missing, meta kept, and no message text", async () => {
    const line = await logLine("notif-a");
    const entry = JSON.parse(line);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.notification_type).toBe("permission_prompt");
    expect(line).not.toContain("SECRET-NOTIFY-TEXT");
    expect(line).not.toContain("SECRET-NOTIFY-TITLE");
  });

  test("a payload missing a required key is still answered and logged as missing", async () => {
    const res = await post({
      session_id: "notif-c",
      hook_event_name: "Notification",
      notification_type: "idle_prompt",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const entry = JSON.parse(await logLine("notif-c"));
    expect(entry.missing).toEqual(["message"]);
    expect(entry.notification_type).toBe("idle_prompt");
  });

  test("the response stays empty for any notification type, including those that would need attention", async () => {
    const res = await post({
      session_id: "notif-d",
      hook_event_name: "Notification",
      message: "Agent finished",
      notification_type: "agent_completed",
    });
    expect(await res.json()).toEqual({});
  });
});
