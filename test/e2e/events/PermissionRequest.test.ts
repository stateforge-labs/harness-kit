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
  hook_event_name: "PermissionRequest",
  permission_mode: "default",
});

const required = { tool_name: "Bash", tool_input: { command: "ls -la" } };

describe("e2e: PermissionRequest", () => {
  test("a realistic payload gets exactly {} (passive, no decision)", async () => {
    const res = await post({ ...common("pr1"), ...required });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  test("the log line is known, has no missing keys, records tool_name and permission_mode, and no payload text", async () => {
    await post({
      ...common("pr2"),
      ...required,
      tool_input: { command: "PERM-SECRET-CMD" },
      prompt: "PERM-SECRET-PROMPT",
      message: "PERM-SECRET-MESSAGE",
    });
    const line = await logLineFor("pr2");
    const entry = JSON.parse(line!);
    expect(entry.event).toBe("PermissionRequest");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.tool_name).toBe("Bash");
    expect(entry.permission_mode).toBe("default");
    expect(line).not.toContain("PERM-SECRET-CMD");
    expect(line).not.toContain("PERM-SECRET-PROMPT");
    expect(line).not.toContain("PERM-SECRET-MESSAGE");
  });

  test("a payload missing tool_input is still answered 200 with {} and logged with tool_input in missing", async () => {
    const res = await post({ ...common("pr3"), tool_name: "Write" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const entry = JSON.parse((await logLineFor("pr3"))!);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual(["tool_input"]);
  });

  test("Agent calls get {} with or without a return-format sentence, and no context is injected", async () => {
    const noFormat = await post({
      ...common("pr4"),
      tool_name: "Agent",
      tool_input: { prompt: "Find all API endpoints", description: "Find API endpoints", subagent_type: "Explore" },
    });
    expect(await noFormat.json()).toEqual({});

    const withFormat = await post({
      ...common("pr5"),
      tool_name: "Agent",
      tool_input: { prompt: "Find all API endpoints. Return a list of at most 20 words.", description: "Find API endpoints" },
    });
    expect(await withFormat.json()).toEqual({});
  });
});
