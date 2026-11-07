import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { resolve } from "node:path";
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

const common = { session_id: "fc-1", transcript_path: "/tmp/t.jsonl", cwd: "/work/proj", hook_event_name: "FileChanged" };

const logLines = async (sessionId: string) =>
  eventually(async () => {
    const f = Bun.file(srv.logFile);
    if (!(await f.exists())) return undefined;
    const rows = (await f.text()).trim().split("\n").map((l) => JSON.parse(l));
    const hit = rows.filter((r) => r.session_id === sessionId);
    return hit.length ? hit : undefined;
  });

describe("e2e: FileChanged", () => {
  test("a realistic payload is answered 200 with an empty passive response", async () => {
    const res = await post({ ...common, file_path: "/work/proj/.envrc", event: "change" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  test("the log line is known, has no missing keys, and carries only the change kind", async () => {
    const SECRET = "SECRET-FILE-BODY-TEXT";
    const res = await post({ ...common, session_id: "fc-2", file_path: "/work/proj/.env", event: "add", tool_response: SECRET });
    expect(res.status).toBe(200);
    const [row] = await logLines("fc-2");
    expect(row.known).toBe(true);
    expect(row.missing).toEqual([]);
    expect(row.change).toBe("add");
    expect(row.event).toBe("FileChanged");
    expect(JSON.stringify(row)).not.toContain(SECRET);
    expect(JSON.stringify(row)).not.toContain("/work/proj/.env");
  });

  test("a payload missing a required key is still answered 200 and logged as missing", async () => {
    const res = await post({ ...common, session_id: "fc-3", event: "unlink" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const [row] = await logLines("fc-3");
    expect(row.known).toBe(true);
    expect(row.missing).toEqual(["file_path"]);
  });

  test("no context injection: a change without a return-format sentence still gets {}", async () => {
    const res = await post({ ...common, session_id: "fc-4", file_path: "/work/proj/README.md", event: "change", prompt: "Summarise the file in 50 words." });
    expect(await res.json()).toEqual({});
  });

  test("replays the first payload of a real headless capture (FileChanged-2)", async () => {
    const captured = resolve(import.meta.dir, "../../../docs/research/studies/2026-11-07-claude-code-hook-surface/evidence/captures/FileChanged-2/events.jsonl");
    const firstLine = (await Bun.file(captured).text()).trim().split("\n")[0] ?? "";
    const { payload } = JSON.parse(firstLine) as { ts: string; payload: Record<string, unknown> };
    const res = await post(payload);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const [row] = await logLines(String(payload.session_id));
    expect(row.known).toBe(true);
    expect(row.missing).toEqual([]);
    expect(row.change).toBe("change");
  });
});
