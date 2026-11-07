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
  hook_event_name: "MessageDisplay",
});

const required = {
  turn_id: "turn-7",
  message_id: "msg-42",
  index: 0,
  final: false,
  delta: "MD-SECRET-TEXT here is the plan\n",
};

describe("e2e: MessageDisplay", () => {
  test("a realistic payload is answered with an empty passive response", async () => {
    const res = await post({ ...common("md1"), ...required });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  test("the log line records known, no missing keys and the meta fields, never message text", async () => {
    await post({ ...common("md2"), ...required, final: true, index: 3, delta: "MD-LOG-SECRET" });
    const line = await logLineFor("md2");
    const entry = JSON.parse(line!);
    expect(entry.event).toBe("MessageDisplay");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.index).toBe(3);
    expect(entry.final).toBe(true);
    expect(entry.message_id).toBe("msg-42");
    expect(entry.turn_id).toBe("turn-7");
    expect(line).not.toContain("MD-LOG-SECRET");
  });

  test("a payload missing the required delta is still answered 200 and logged with delta in missing", async () => {
    const { delta: _omit, ...withoutDelta } = required;
    const res = await post({ ...common("md3"), ...withoutDelta });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const entry = JSON.parse((await logLineFor("md3"))!);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual(["delta"]);
  });

  test("stays passive: never replaces the text with displayContent, blocks or adds context", async () => {
    const res = await post({ ...common("md4"), ...required, delta: "**bold** text", final: true });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({});
    expect(body.hookSpecificOutput).toBeUndefined();
    expect(body.decision).toBeUndefined();
  });
});
