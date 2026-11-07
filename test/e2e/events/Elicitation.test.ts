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

const readLog = async () => {
  const f = Bun.file(srv.logFile);
  return (await f.exists()) ? await f.text() : "";
};

const logLineFor = (sessionId: string) =>
  eventually(async () => (await readLog()).split("\n").find((l) => l.includes(`"session_id":"${sessionId}"`)));

const common = (sessionId: string) => ({
  session_id: sessionId,
  transcript_path: "/home/user/.claude/projects/x/transcript.jsonl",
  cwd: "/home/user/project",
  hook_event_name: "Elicitation",
});

describe("e2e: Elicitation", () => {
  test("a realistic payload is answered with an empty passive response", async () => {
    const res = await post({
      ...common("el1"),
      mcp_server_name: "my-mcp-server",
      message: "ELICIT-SECRET-MESSAGE",
      mode: "form",
      requested_schema: { type: "object", properties: { branch: { type: "string" } } },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  test("the log line records known, no missing keys and the server and mode meta, never the message text", async () => {
    await post({ ...common("el2"), mcp_server_name: "my-mcp-server", message: "ELICIT-SECRET-TEXT", mode: "url" });
    const line = await logLineFor("el2");
    const entry = JSON.parse(line!);
    expect(entry.event).toBe("Elicitation");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.mcp_server_name).toBe("my-mcp-server");
    expect(entry.mode).toBe("url");
    expect(line).not.toContain("ELICIT-SECRET-TEXT");
  });

  test("a payload missing the required message is still answered 200 and logged with message in missing", async () => {
    const res = await post({ ...common("el3"), mcp_server_name: "my-mcp-server" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const entry = JSON.parse((await logLineFor("el3"))!);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual(["message"]);
  });

  test("never declines, blocks or answers the request, even for a url-mode elicitation", async () => {
    const res = await post({
      ...common("el4"),
      mcp_server_name: "my-mcp-server",
      message: "Open the sign-in page",
      mode: "url",
      url: "https://example.com/auth",
      elicitation_id: "e-1",
    });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.decision).toBeUndefined();
    expect(body.hookSpecificOutput).toBeUndefined();
  });

  test("replaying the first real captured Elicitation payload is answered {} and logged known with no missing keys", async () => {
    const capturePath = join(
      import.meta.dir,
      "..",
      "..",
      "..",
      "docs/research/studies/2026-11-07-claude-code-hook-surface/evidence/captures/Elicitation-1/events.jsonl",
    );
    const firstLine = (await Bun.file(capturePath).text()).split("\n").find((l) => l.trim() !== "");
    const { payload } = JSON.parse(firstLine!) as { ts: string; payload: Record<string, unknown> };
    expect(payload.hook_event_name).toBe("Elicitation");

    const res = await post(payload);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});

    const entry = JSON.parse((await logLineFor(String(payload.session_id)))!);
    expect(entry.event).toBe("Elicitation");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.mcp_server_name).toBe("elicit");
    expect(entry.mode).toBe("form");
  });
});
