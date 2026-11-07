import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { eventually, startServer, type RunningServer } from "../harness.ts";

// First real ConfigChange payload captured from a headless claude run (ConfigChange-3).
const FIRST_CAPTURE = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "docs/research/studies/2026-11-07-claude-code-hook-surface/evidence/captures/ConfigChange-3/events.jsonl",
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

const readLog = async () => {
  const f = Bun.file(srv.logFile);
  return (await f.exists()) ? await f.text() : "";
};

const logLineFor = (sessionId: string) =>
  eventually(async () => {
    const line = (await readLog()).split("\n").find((l) => l.includes(`"session_id":"${sessionId}"`));
    return line;
  });

const common = (sessionId: string) => ({
  session_id: sessionId,
  transcript_path: "/home/user/.claude/projects/x/transcript.jsonl",
  cwd: "/home/user/project",
  hook_event_name: "ConfigChange",
});

describe("e2e: ConfigChange", () => {
  test("a realistic payload is answered with an empty passive response", async () => {
    const res = await post({ ...common("cc1"), source: "project_settings", file_path: "/home/user/project/.claude/settings.json" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  test("the log line records known, no missing keys and the source meta, never payload text", async () => {
    await post({ ...common("cc2"), source: "user_settings", message: "CONFIG-SECRET-TEXT" });
    const line = await logLineFor("cc2");
    const entry = JSON.parse(line!);
    expect(entry.event).toBe("ConfigChange");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.source).toBe("user_settings");
    expect(line).not.toContain("CONFIG-SECRET-TEXT");
  });

  test("a payload missing the required source is still answered 200 and logged with source in missing", async () => {
    const res = await post(common("cc3"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const entry = JSON.parse((await logLineFor("cc3"))!);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual(["source"]);
  });

  test("a payload captured from a real claude run is answered 200 with {} and logged known with no missing keys", async () => {
    const first = JSON.parse((await Bun.file(FIRST_CAPTURE).text()).split("\n")[0]!) as { payload: Record<string, unknown> };
    const res = await post(first.payload);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const entry = JSON.parse((await logLineFor(String(first.payload.session_id)))!);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.source).toBe("local_settings");
  });

  test("never blocks or adds context, even for a project settings change", async () => {
    const res = await post({ ...common("cc4"), source: "project_settings", file_path: "/x/.claude/settings.json" });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.decision).toBeUndefined();
    expect(body.hookSpecificOutput).toBeUndefined();
  });
});
