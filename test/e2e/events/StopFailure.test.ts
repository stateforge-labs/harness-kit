import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { eventually, startServer, type RunningServer } from "../harness.ts";

// Real payloads captured from headless Claude Code (see evidence/captures/StopFailure-1/events.jsonl).
const CAPTURED = resolve(
  import.meta.dir,
  "../../../docs/research/studies/2026-11-07-claude-code-hook-surface/evidence/captures/StopFailure-1/events.jsonl",
);

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
  hook_event_name: "StopFailure",
});

describe("e2e: StopFailure", () => {
  test("a realistic payload is answered with an empty response", async () => {
    const res = await post({
      ...common("sf1"),
      error: "rate_limit",
      error_details: "429 Too Many Requests",
      last_assistant_message: "I was partway through the refactor.",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  test("the log line is known, has no missing keys, records the error category, and no text", async () => {
    await post({
      ...common("sf2"),
      error: "server_error",
      error_details: "SF-SECRET-DETAILS",
      last_assistant_message: "SF-SECRET-MESSAGE",
      prompt: "SF-SECRET-PROMPT",
      tool_input: { command: "SF-SECRET-CMD" },
    });
    const line = await logLineFor("sf2");
    const entry = JSON.parse(line!);
    expect(entry.event).toBe("StopFailure");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.error).toBe("server_error");
    expect(line).not.toContain("SF-SECRET-DETAILS");
    expect(line).not.toContain("SF-SECRET-MESSAGE");
    expect(line).not.toContain("SF-SECRET-PROMPT");
    expect(line).not.toContain("SF-SECRET-CMD");
  });

  test("a payload missing error is still answered 200 and logged with error in missing", async () => {
    const res = await post({ ...common("sf3"), last_assistant_message: "no error field here" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const entry = JSON.parse((await logLineFor("sf3"))!);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual(["error"]);
  });

  test("a captured real payload (StopFailure-1) is answered {} and logged known with no missing keys", async () => {
    const line = (await Bun.file(CAPTURED).text()).split("\n").find((l) => l.trim().length > 0);
    const { payload } = JSON.parse(line!) as { ts: string; payload: Record<string, unknown> };
    const res = await post(payload);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const entry = JSON.parse((await logLineFor(String(payload.session_id)))!);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.error).toBe("model_not_found");
  });

  test("never blocks, injects context, or sets terminalSequence, even when tool_name is present", async () => {
    const res = await post({ ...common("sf4"), error: "billing_error", tool_name: "Agent" });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({});
    expect(body.hookSpecificOutput).toBeUndefined();
    expect(body.terminalSequence).toBeUndefined();
    expect(body.decision).toBeUndefined();
    expect(body.continue).toBeUndefined();
  });
});
