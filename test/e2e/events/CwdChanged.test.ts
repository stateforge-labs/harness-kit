import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eventually, startServer, type RunningServer } from "../harness.ts";

const TOKEN = "t0k3n";
let srv: RunningServer;

beforeAll(async () => {
  srv = await startServer({ HOOK_TOKEN: TOKEN });
});
afterAll(() => srv.stop());

const post = (body: unknown) =>
  fetch(`${srv.base}/hook`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(body),
  });

const logLines = async (sessionId: string) => {
  const f = Bun.file(srv.logFile);
  const text = (await f.exists()) ? await f.text() : "";
  const lines = text.split("\n").filter((l) => l.includes(`"session_id":"${sessionId}"`));
  return lines.length ? lines : undefined;
};

const base = {
  session_id: "cwd-1",
  transcript_path: "/home/dev/.claude/projects/p/transcript.jsonl",
  cwd: "/home/dev/project/src",
  hook_event_name: "CwdChanged",
  permission_mode: "default",
};

describe("e2e: CwdChanged", () => {
  test("a realistic payload gets an empty response", async () => {
    const res = await post({ ...base, old_cwd: "/home/dev/project", new_cwd: "/home/dev/project/src" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  test("the log line is known, has no missing keys, and no paths or prompt text", async () => {
    const secretDir = "SECRET-DIR-NAME";
    await post({
      ...base,
      session_id: "cwd-2",
      old_cwd: `/home/dev/${secretDir}`,
      new_cwd: "/home/dev/project/src",
      prompt: "SECRET-PROMPT-TEXT",
    });
    const lines = await eventually(() => logLines("cwd-2"));
    const entry = JSON.parse(lines[0]!);
    expect(entry.event).toBe("CwdChanged");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    const all = lines.join("\n");
    expect(all).not.toContain(secretDir);
    expect(all).not.toContain("SECRET-PROMPT-TEXT");
  });

  test("a payload missing new_cwd is still answered 200 and logged with it as missing", async () => {
    const res = await post({ ...base, session_id: "cwd-3", old_cwd: "/home/dev/project" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const lines = await eventually(() => logLines("cwd-3"));
    const entry = JSON.parse(lines[0]!);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual(["new_cwd"]);
  });

  test("the first captured real payload is answered 200 with no missing keys", async () => {
    const capture = join(
      import.meta.dir,
      "../../../docs/research/studies/2026-11-07-claude-code-hook-surface/evidence/captures/CwdChanged-1/events.jsonl",
    );
    const firstLine = (await Bun.file(capture).text()).split("\n").find((l) => l.trim());
    const { payload } = JSON.parse(firstLine!) as { ts: string; payload: Record<string, unknown> };
    const sessionId = String(payload.session_id);

    const res = await post(payload);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const lines = await eventually(() => logLines(sessionId));
    const entry = JSON.parse(lines[0]!);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
  });

  test("every captured CwdChanged payload is answered 200 with no missing keys", async () => {
    const dirs = ["CwdChanged-1", "CwdChanged-2", "CwdChanged-3"];
    let count = 0;
    for (const dir of dirs) {
      const capture = join(
        import.meta.dir,
        "../../../docs/research/studies/2026-11-07-claude-code-hook-surface/evidence/captures",
        dir,
        "events.jsonl",
      );
      const lines = (await Bun.file(capture).text()).split("\n").filter((l) => l.trim());
      for (const line of lines) {
        const { payload } = JSON.parse(line) as { payload: Record<string, unknown> };
        const sessionId = String(payload.session_id);
        const res = await post(payload);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({});
        const logged = await eventually(() => logLines(sessionId));
        expect(JSON.parse(logged[0]!).missing).toEqual([]);
        count++;
      }
    }
    expect(count).toBe(4);
  });
});
