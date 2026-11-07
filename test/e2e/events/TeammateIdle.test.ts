import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eventually, startServer, type RunningServer } from "../harness.ts";

const SECRET_MESSAGE = "TEAMMATE-SECRET-MESSAGE";
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
  session_id: "ti-1",
  transcript_path: "/home/user/.claude/projects/x/ti-1.jsonl",
  cwd: "/home/user/work",
  hook_event_name: "TeammateIdle",
};

describe("e2e: TeammateIdle", () => {
  test("a full payload gets an empty passive response", async () => {
    const res = await post({
      ...commonFields,
      teammate_name: "reviewer-2",
      team_name: "release-team",
      agent_id: "agent-abc",
      permission_mode: "default",
      last_message: SECRET_MESSAGE,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  test("the log keeps the teammate and team names and never the message text", async () => {
    const entry = await logLineFor("ti-1");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.teammate_name).toBe("reviewer-2");
    expect(entry.team_name).toBe("release-team");
    expect(JSON.stringify(entry)).not.toContain(SECRET_MESSAGE);
    expect(await readLog()).not.toContain(SECRET_MESSAGE);
  });

  test("a payload missing a required key is still answered 200 and logged as missing", async () => {
    const res = await post({ ...commonFields, session_id: "ti-2", teammate_name: "builder-1" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const entry = await logLineFor("ti-2");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual(["team_name"]);
    expect(entry.teammate_name).toBe("builder-1");
  });

  test("the response stays empty even when the payload asks to stop the teammate", async () => {
    const res = await post({
      ...commonFields,
      session_id: "ti-3",
      teammate_name: "builder-1",
      team_name: "release-team",
      continue: false,
      stopReason: "stop",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });
});
