import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { eventually, startServer, type RunningServer } from "../harness.ts";

// The payload replayed here is the one a real interactive Claude Code session sent
// (permission_prompt, Notification-6 in the 2026-11-07 hook-surface study), not a hand-written one.
const CAPTURE = join(
  import.meta.dir,
  "../../../docs/research/studies/2026-11-07-claude-code-hook-surface/evidence/captures/Notification-6/events.jsonl",
);

async function capturedNotification(): Promise<Record<string, unknown>> {
  const lines = (await Bun.file(CAPTURE).text()).split("\n").filter(Boolean);
  const hit = lines
    .map((l) => JSON.parse(l).payload as Record<string, unknown>)
    .find((p) => p.hook_event_name === "Notification");
  if (!hit) throw new Error(`no Notification payload in ${CAPTURE}`);
  return hit;
}

let srv: RunningServer;
let captured: Record<string, unknown>;

beforeAll(async () => {
  captured = await capturedNotification();
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
  test("the captured permission_prompt payload is answered with an empty object", async () => {
    const res = await post(captured);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  test("the log line is known, nothing missing, meta kept, and no message text", async () => {
    const line = await logLine(String(captured.session_id));
    const entry = JSON.parse(line);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.notification_type).toBe("permission_prompt");
    expect(line).not.toContain(String(captured.message));
  });

  test("a captured payload without its required message is still answered and logged as missing", async () => {
    const { message: _dropped, ...withoutMessage } = captured;
    const body = { ...withoutMessage, session_id: "notif-c" };
    const res = await post(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const entry = JSON.parse(await logLine("notif-c"));
    expect(entry.missing).toEqual(["message"]);
    expect(entry.notification_type).toBe("permission_prompt");
  });

  test("the response stays empty for a notification type that would need attention", async () => {
    const res = await post({ ...captured, session_id: "notif-d", notification_type: "agent_completed" });
    expect(await res.json()).toEqual({});
  });
});
