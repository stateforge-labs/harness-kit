import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eventually, startServer, type RunningServer } from "../harness.ts";

// Payload copied verbatim from evidence/captures/TeammateIdle-6/events.jsonl (real agent-team teammate).
const CAPTURED = {
  session_id: "1a023d31-4214-41e4-8231-270bd91387d1",
  transcript_path: "~/.claude/projects/-tmp-tmp-6iarms8Uno/1a023d31-4214-41e4-8231-270bd91387d1.jsonl",
  cwd: "/tmp/tmp.6iarms8Uno",
  scratchpad_dir:
    "~/.cache/claude-tmp/claude-1000/-tmp-tmp-6iarms8Uno/1a023d31-4214-41e4-8231-270bd91387d1/scratchpad",
  prompt_id: "f3101c92-302d-4a63-a19e-4ff6f9ca12c9",
  agent_id: "aresearcher-071a9e0a4ead0b0a",
  agent_type: "researcher",
  permission_mode: "auto",
  hook_event_name: "TeammateIdle",
  teammate_name: "researcher",
  team_name: "session-1a023d31",
};

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

describe("e2e: TeammateIdle", () => {
  test("the captured teammate payload gets an empty passive response", async () => {
    const res = await post(CAPTURED);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  test("the log keeps the teammate, team, agent and mode fields from the capture", async () => {
    const entry = await logLineFor(CAPTURED.session_id);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.teammate_name).toBe("researcher");
    expect(entry.team_name).toBe("session-1a023d31");
    expect(entry.agent_id).toBe("aresearcher-071a9e0a4ead0b0a");
    expect(entry.agent_type).toBe("researcher");
    expect(entry.permission_mode).toBe("auto");
  });

  test("a payload without the deprecated team_name is answered 200 and not flagged as missing", async () => {
    const { team_name: _dropped, ...withoutTeam } = CAPTURED;
    const res = await post({ ...withoutTeam, session_id: "ti-2" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const entry = await logLineFor("ti-2");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.team_name).toBeNull();
  });

  test("a payload missing teammate_name is still answered 200 and logged as missing", async () => {
    const { teammate_name: _dropped, ...withoutTeammate } = CAPTURED;
    const res = await post({ ...withoutTeammate, session_id: "ti-3" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const entry = await logLineFor("ti-3");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual(["teammate_name"]);
  });

  test("an extra message field is never written to the log", async () => {
    const res = await post({ ...CAPTURED, session_id: "ti-4", last_message: SECRET_MESSAGE });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    await logLineFor("ti-4");
    expect(await readLog()).not.toContain(SECRET_MESSAGE);
  });

  test("the response stays empty even when the payload asks to stop the teammate", async () => {
    const res = await post({ ...CAPTURED, session_id: "ti-5", continue: false, stopReason: "stop" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });
});
