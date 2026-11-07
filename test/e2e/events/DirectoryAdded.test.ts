import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { eventually, startServer, type RunningServer } from "../harness.ts";

// First real DirectoryAdded payload captured from a headless claude run (DirectoryAdded-2).
const FIRST_CAPTURE = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "docs/research/studies/2026-11-07-claude-code-hook-surface/evidence/captures/DirectoryAdded-2/events.jsonl",
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
  hook_event_name: "DirectoryAdded",
});

const required = { directory: "/home/user/other-repo", source: "slash_command" };

describe("e2e: DirectoryAdded", () => {
  test("a realistic payload gets an empty object (passive, no context, no blocking)", async () => {
    const res = await post({ ...common("dir1"), ...required });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  test("the log line is known, has no missing keys, records source, and no directory or payload text", async () => {
    await post({
      ...common("dir2"),
      ...required,
      directory: "/home/user/DIR-SECRET-PATH",
      prompt: "DIRADD-SECRET-PROMPT",
      tool_input: { command: "DIRADD-SECRET-CMD" },
    });
    const line = await logLineFor("dir2");
    const entry = JSON.parse(line!);
    expect(entry.event).toBe("DirectoryAdded");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.source).toBe("slash_command");
    expect(line).not.toContain("DIR-SECRET-PATH");
    expect(line).not.toContain("DIRADD-SECRET-PROMPT");
    expect(line).not.toContain("DIRADD-SECRET-CMD");
  });

  test("a payload missing source is still answered 200 with {} and logged with source in missing", async () => {
    const res = await post({ ...common("dir3"), directory: "/home/user/other-repo" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const entry = JSON.parse((await logLineFor("dir3"))!);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual(["source"]);
  });

  test("register_repo_root source also gets {} with no decision or blocking fields", async () => {
    const res = await post({ ...common("dir4"), directory: "/home/user/sdk-repo", source: "register_repo_root" });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({});
    expect(body.decision).toBeUndefined();
    expect(body.continue).toBeUndefined();
    expect(body.permissionDecision).toBeUndefined();
    expect(body.hookSpecificOutput).toBeUndefined();
  });

  test("a payload captured from a real claude run is answered 200 with {} and logged known with no missing keys", async () => {
    const first = JSON.parse((await Bun.file(FIRST_CAPTURE).text()).split("\n")[0]!) as { payload: Record<string, unknown> };
    const res = await post(first.payload);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const entry = JSON.parse((await logLineFor(String(first.payload.session_id)))!);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.source).toBe("register_repo_root");
  });
});
