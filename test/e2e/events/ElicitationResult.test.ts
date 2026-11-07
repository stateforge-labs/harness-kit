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
  hook_event_name: "ElicitationResult",
});

describe("e2e: ElicitationResult", () => {
  test("a realistic payload is answered with an empty passive response", async () => {
    const res = await post({
      ...common("er1"),
      mcp_server_name: "github",
      action: "accept",
      mode: "form",
      elicitation_id: "elic-1",
      content: { branch: "feat/x" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  test("the log line records known, no missing keys and the meta fields, never payload text", async () => {
    await post({
      ...common("er2"),
      mcp_server_name: "github",
      action: "decline",
      mode: "form",
      elicitation_id: "elic-2",
      content: { token: "ER-SECRET-CONTENT" },
    });
    const line = await logLineFor("er2");
    const entry = JSON.parse(line!);
    expect(entry.event).toBe("ElicitationResult");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.mcp_server_name).toBe("github");
    expect(entry.action).toBe("decline");
    expect(entry.mode).toBe("form");
    expect(entry.elicitation_id).toBe("elic-2");
    expect(line).not.toContain("ER-SECRET-CONTENT");
  });

  test("a payload missing the required action is still answered 200 and logged with action in missing", async () => {
    const res = await post({ ...common("er3"), mcp_server_name: "github" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const entry = JSON.parse((await logLineFor("er3"))!);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual(["action"]);
  });

  test("never blocks or overrides the action, even when the user cancels", async () => {
    const res = await post({ ...common("er4"), mcp_server_name: "github", action: "cancel", mode: "url" });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({});
    expect(body.decision).toBeUndefined();
    expect(body.hookSpecificOutput).toBeUndefined();
  });

  test("replays a real captured ElicitationResult payload: 200, empty response, known with no missing keys", async () => {
    // First line of captures/ElicitationResult-3 (ElicitationResult-1's first line is an Elicitation payload, not this event).
    const capture = new URL(
      "../../../docs/research/studies/2026-11-07-claude-code-hook-surface/evidence/captures/ElicitationResult-3/events.jsonl",
      import.meta.url,
    );
    const first = JSON.parse((await Bun.file(capture).text()).split("\n")[0]!) as { payload: Record<string, unknown> };
    const sessionId = String(first.payload.session_id);
    const res = await post(first.payload);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const entry = JSON.parse((await logLineFor(sessionId))!);
    expect(entry.event).toBe("ElicitationResult");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.mcp_server_name).toBe("elic");
    expect(entry.action).toBe("cancel");
    expect(entry.mode).toBe("form");
  });
});
