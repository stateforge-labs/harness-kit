import { join } from "node:path";
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

const common = (sessionId: string) => ({
  session_id: sessionId,
  transcript_path: "/home/user/.claude/projects/x/transcript.jsonl",
  cwd: "/home/user/project",
  hook_event_name: "SessionStart",
});

const required = { source: "startup" };

const logLineFor = (sessionId: string) =>
  eventually(async () => {
    const text = await Bun.file(srv.logFile).text().catch(() => "");
    return text.split("\n").find((l) => l.includes(`"session_id":"${sessionId}"`));
  });

describe("e2e: SessionStart", () => {
  test("a realistic payload gets the delegation rules as context", async () => {
    const res = await post({ ...common("ss1"), ...required, model: "claude-opus-5" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(Object.keys(body)).toEqual(["hookSpecificOutput"]);
    expect(Object.keys(body.hookSpecificOutput).sort()).toEqual(["additionalContext", "hookEventName"]);
    expect(body.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(body.hookSpecificOutput.additionalContext).toStartWith("Delegation rules (harness-hooks server):");
  });

  test("the log line records known, no missing keys and the source/model meta, never payload text", async () => {
    await post({ ...common("ss2"), ...required, model: "claude-haiku-5-5", session_title: "SS-SECRET-TITLE" });
    const entry = JSON.parse((await logLineFor("ss2"))!);
    expect(entry.event).toBe("SessionStart");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.source).toBe("startup");
    expect(entry.model).toBe("claude-haiku-5-5");
    expect(JSON.stringify(entry)).not.toContain("SS-SECRET-TITLE");
  });

  test("a payload missing source is still answered 200 with the context and logged with source in missing", async () => {
    const res = await post({ ...common("ss3") });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.hookSpecificOutput.hookEventName).toBe("SessionStart");
    const entry = JSON.parse((await logLineFor("ss3"))!);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual(["source"]);
    expect(entry.source).toBeNull();
  });

  test("every session start type gets the context and is never blocked", async () => {
    for (const source of ["startup", "resume", "clear", "compact"]) {
      const body = (await (await post({ ...common(`ss-${source}`), source })).json()) as any;
      expect(body.hookSpecificOutput.additionalContext).toStartWith("Delegation rules");
      expect(body.continue).toBeUndefined();
      expect(body.decision).toBeUndefined();
    }
  });

  test("a real captured startup payload (SessionStart-1) replays to 200 with the context and is logged known with no missing keys", async () => {
    const captureFile = join(
      import.meta.dir,
      "../../../docs/research/studies/2026-11-07-claude-code-hook-surface/evidence/captures/SessionStart-1/events.jsonl",
    );
    const first = (await Bun.file(captureFile).text()).split("\n").find((l) => l.trim() !== "");
    const { payload } = JSON.parse(first!) as { ts: string; payload: { session_id: string } };
    const res = await post(payload);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(body.hookSpecificOutput.additionalContext).toStartWith("Delegation rules (harness-hooks server):");
    const entry = JSON.parse((await logLineFor(payload.session_id))!);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.source).toBe("startup");
  });
});
