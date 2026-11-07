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
  hook_event_name: "PreCompact",
});

describe("e2e: PreCompact", () => {
  test("a realistic manual payload gets an empty object, with no decision or blocking fields", async () => {
    const res = await post({ ...common("pc1"), trigger: "manual", custom_instructions: null });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  test("the log line is known, has no missing keys, records trigger, and no custom instruction text", async () => {
    await post({
      ...common("pc2"),
      trigger: "manual",
      custom_instructions: "PRECOMPACT-SECRET-INSTRUCTIONS keep the TODO list",
      messages: "PRECOMPACT-SECRET-MESSAGE",
    });
    const line = await logLineFor("pc2");
    const entry = JSON.parse(line!);
    expect(entry.event).toBe("PreCompact");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.trigger).toBe("manual");
    expect(line).not.toContain("PRECOMPACT-SECRET-INSTRUCTIONS");
    expect(line).not.toContain("PRECOMPACT-SECRET-MESSAGE");
  });

  test("a payload missing custom_instructions is still answered 200 with {} and logged with it in missing", async () => {
    const res = await post({ ...common("pc3"), trigger: "auto" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const entry = JSON.parse((await logLineFor("pc3"))!);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual(["custom_instructions"]);
    expect(entry.trigger).toBe("auto");
  });

  test("auto compaction and a manual one with instructions both stay passive", async () => {
    const auto = await (await post({ ...common("pc4"), trigger: "auto", custom_instructions: null })).json();
    const manual = await (await post({ ...common("pc5"), trigger: "manual", custom_instructions: "focus on tests" })).json();
    expect(auto).toEqual({});
    expect(manual).toEqual({});
  });
});
