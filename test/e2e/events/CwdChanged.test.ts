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
});
