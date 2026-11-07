import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { eventually, startServer, type RunningServer } from "../harness.ts";

const TOKEN = "t0k3n";
const SECRET_CMD = "rm -rf SECRET-PATH-ZZ9";
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

const common = (session_id: string) => ({
  session_id,
  transcript_path: "/tmp/transcript.jsonl",
  cwd: "/work",
  permission_mode: "auto",
  hook_event_name: "PermissionDenied",
});

/** Wait for the log line of one session and return the raw text plus the parsed line. */
async function logLineFor(session_id: string) {
  return eventually(async () => {
    const text = await Bun.file(srv.logFile).text().catch(() => "");
    const line = text.split("\n").find((l) => l.includes(`"session_id":"${session_id}"`));
    return line ? { text, line: JSON.parse(line) as Record<string, unknown> } : undefined;
  });
}

describe("e2e: PermissionDenied", () => {
  test("a full payload gets an empty response", async () => {
    const res = await post({
      ...common("pd-1"),
      tool_name: "Bash",
      tool_input: { command: SECRET_CMD, description: "clean" },
      tool_use_id: "toolu_01",
      reason: "[Irreversible Local Destruction]",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  test("the log records known, no missing keys and meta, but never tool_input", async () => {
    const { text, line } = await logLineFor("pd-1");
    expect(line.known).toBe(true);
    expect(line.missing).toEqual([]);
    expect(line.tool_name).toBe("Bash");
    expect(line.reason).toBe("[Irreversible Local Destruction]");
    expect(line.permission_mode).toBe("auto");
    expect(text).not.toContain("SECRET-PATH-ZZ9");
  });

  test("a payload missing a required key is still answered and logged with it in missing", async () => {
    const res = await post({
      ...common("pd-2"),
      tool_name: "Bash",
      tool_input: { command: SECRET_CMD },
      reason: "[Data Exfiltration]",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const { line } = await logLineFor("pd-2");
    expect(line.known).toBe(true);
    expect(line.missing).toEqual(["tool_use_id"]);
  });

  test("the handler stays passive: no retry, even for an Agent call with a classifier denial", async () => {
    const res = await post({
      ...common("pd-3"),
      tool_name: "Agent",
      tool_input: { prompt: "Find all API endpoints", model: "sonnet" },
      tool_use_id: "toolu_02",
      reason: "Auto mode could not evaluate this action and is blocking it for safety",
    });
    expect(await res.json()).toEqual({});
  });
});

describe("e2e: PermissionDenied replay of a real capture", () => {
  test("the first captured PermissionDenied payload is answered {} and logged known with no missing keys", async () => {
    // Line 1 of the capture is a PreToolUse payload, so pick the first line whose hook_event_name is PermissionDenied.
    const capture = join(
      import.meta.dir,
      "..",
      "..",
      "..",
      "docs",
      "research",
      "studies",
      "2026-11-07-claude-code-hook-surface",
      "evidence",
      "captures",
      "PermissionDenied-4",
      "events.jsonl",
    );
    const lines = (await Bun.file(capture).text()).split("\n").filter((l) => l.trim());
    const entry = lines
      .map((l) => JSON.parse(l) as { ts: string; payload: Record<string, unknown> })
      .find((e) => e.payload.hook_event_name === "PermissionDenied");
    expect(entry).toBeDefined();
    const payload = entry!.payload;

    const res = await post(payload);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});

    const { line } = await logLineFor(String(payload.session_id));
    expect(line.known).toBe(true);
    expect(line.missing).toEqual([]);
    expect(line.tool_name).toBe("Bash");
    expect(line.reason).toBe("[Data Exfiltration]");
  });
});
