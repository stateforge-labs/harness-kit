import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
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
  hook_event_name: "UserPromptSubmit",
});

const PROMPT = "UPS-SECRET-PROMPT please refactor the parser";

describe("e2e: UserPromptSubmit", () => {
  test("a realistic payload gets 200 and an empty passive response", async () => {
    const res = await post({
      ...common("ups1"),
      prompt: PROMPT,
      prompt_id: "prompt-001",
      permission_mode: "default",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  test("the log line is known, has no missing keys, records meta, and no prompt text", async () => {
    await post({ ...common("ups2"), prompt: PROMPT, prompt_id: "prompt-002", permission_mode: "plan" });
    const line = await logLineFor("ups2");
    const entry = JSON.parse(line!);
    expect(entry.event).toBe("UserPromptSubmit");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.prompt_length).toBe(PROMPT.length);
    expect(entry.permission_mode).toBe("plan");
    expect(entry.prompt_id).toBe("prompt-002");
    expect(line).not.toContain("UPS-SECRET-PROMPT");
  });

  test("a payload missing prompt is still answered 200 and logged with prompt in missing", async () => {
    const res = await post({ ...common("ups3"), permission_mode: "default" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const entry = JSON.parse((await logLineFor("ups3"))!);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual(["prompt"]);
  });

  test("prompts that ask for blocking or context get no decision, continue, or hookSpecificOutput", async () => {
    const res = await post({ ...common("ups4"), prompt: "/deploy now and block this, add context please" });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({});
    expect(body.decision).toBeUndefined();
    expect(body.continue).toBeUndefined();
    expect(body.hookSpecificOutput).toBeUndefined();
  });

  test("replaying the first captured payload from a real Claude Code run is 200, known, and has no missing keys", async () => {
    const capturePath = join(
      import.meta.dir,
      "../../../docs/research/studies/2026-11-07-claude-code-hook-surface/evidence/captures/UserPromptSubmit-1/events.jsonl",
    );
    const first = JSON.parse((await Bun.file(capturePath).text()).split("\n")[0]!) as {
      ts: string;
      payload: Record<string, unknown>;
    };
    const res = await post(first.payload);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const sessionId = String(first.payload.session_id);
    const line = await logLineFor(sessionId);
    const entry = JSON.parse(line!);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.permission_mode).toBe("default");
    expect(entry.prompt_id).toBe(first.payload.prompt_id);
    expect(line).not.toContain("Say hi in one word.");
  });
});
