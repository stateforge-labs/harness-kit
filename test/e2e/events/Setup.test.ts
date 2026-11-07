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
  hook_event_name: "Setup",
});

describe("e2e: Setup", () => {
  test("a realistic payload is answered with an empty response", async () => {
    const res = await post({ ...common("setup1"), trigger: "init" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  test("the log line is known, has no missing keys, records the trigger, and no payload text", async () => {
    await post({ ...common("setup2"), trigger: "maintenance", prompt: "SETUP-SECRET-PROMPT" });
    const line = await logLineFor("setup2");
    const entry = JSON.parse(line!);
    expect(entry.event).toBe("Setup");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.trigger).toBe("maintenance");
    expect(line).not.toContain("SETUP-SECRET-PROMPT");
  });

  test("a payload missing trigger is still answered 200 and logged with trigger in missing", async () => {
    const res = await post(common("setup3"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const entry = JSON.parse((await logLineFor("setup3"))!);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual(["trigger"]);
  });

  test("never returns context, decisions or blocking fields, even for a setup that would otherwise get SessionStart context", async () => {
    const res = await post({ ...common("setup4"), trigger: "init" });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.hookSpecificOutput).toBeUndefined();
    expect(body.decision).toBeUndefined();
    expect(body.continue).toBeUndefined();
    expect(body.systemMessage).toBeUndefined();
  });
});
