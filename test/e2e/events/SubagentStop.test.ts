import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { eventually, startServer, type RunningServer } from "../harness.ts";

const SECRET_MSG = "SUBAGENT-FINAL-SECRET-SS7";
const SECRET_PROMPT = "SUBAGENT-PROMPT-SECRET-SS7";
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

const common = (session_id: string) => ({
  session_id,
  transcript_path: "/home/user/.claude/projects/x/transcript.jsonl",
  cwd: "/home/user/project",
  permission_mode: "default",
  hook_event_name: "SubagentStop",
});

const subagentFields = (agent_id: string) => ({
  stop_hook_active: false,
  agent_id,
  agent_type: "general-purpose",
  agent_transcript_path: `/home/user/.claude/projects/x/subagents/agent-${agent_id}.jsonl`,
  last_assistant_message: SECRET_MSG,
});

/** Wait for the log line of one session and return the raw text plus the parsed line. */
async function logLineFor(session_id: string) {
  return eventually(async () => {
    const text = await Bun.file(srv.logFile).text().catch(() => "");
    const line = text.split("\n").find((l) => l.includes(`"session_id":"${session_id}"`));
    return line ? { text, line: JSON.parse(line) as Record<string, unknown> } : undefined;
  });
}

describe("e2e: SubagentStop", () => {
  test("a realistic payload gets an empty response", async () => {
    const res = await post({
      ...common("ss-1"),
      ...subagentFields("a1"),
      effort: { level: "high" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  test("the log is known, has no missing keys, records meta, and never the message or prompt text", async () => {
    await post({ ...common("ss-2"), ...subagentFields("a2"), prompt: SECRET_PROMPT, effort: { level: "medium" } });
    const { text, line } = await logLineFor("ss-2");
    expect(line.event).toBe("SubagentStop");
    expect(line.known).toBe(true);
    expect(line.missing).toEqual([]);
    expect(line.agent_type).toBe("general-purpose");
    expect(line.agent_id).toBe("a2");
    expect(line.stop_hook_active).toBe(false);
    expect(line.permission_mode).toBe("default");
    expect(line.effort_level).toBe("medium");
    expect(text).not.toContain(SECRET_MSG);
    expect(text).not.toContain(SECRET_PROMPT);
  });

  test("a payload missing a required key is still answered 200 and logged with it in missing", async () => {
    const { last_assistant_message: _omit, ...rest } = subagentFields("a3");
    const res = await post({ ...common("ss-3"), ...rest });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const { line } = await logLineFor("ss-3");
    expect(line.known).toBe(true);
    expect(line.missing).toEqual(["last_assistant_message"]);
  });

  test("never returns a decision, a block or context, even when stop_hook_active is true", async () => {
    const res = await post({ ...common("ss-4"), ...subagentFields("a4"), stop_hook_active: true });
    expect(await res.json()).toEqual({});
  });

  test("replays a captured SubagentStop payload from the evidence: 200, {}, known with no missing keys", async () => {
    const captured = resolve(
      import.meta.dir,
      "../../../docs/research/studies/2026-11-07-claude-code-hook-surface/evidence/captures/SubagentStop-1/events.jsonl",
    );
    const lines = (await Bun.file(captured).text())
      .split("\n")
      .filter((l) => l.trim() !== "")
      .map((l) => JSON.parse(l) as { ts: string; payload: Record<string, unknown> });
    // The capture file's first line is a SubagentStart payload, so take the first SubagentStop line.
    const first = lines.find((l) => l.payload.hook_event_name === "SubagentStop");
    if (!first) throw new Error("no SubagentStop payload in the capture file");
    const session_id = String(first.payload.session_id);
    const res = await post(first.payload);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const { line } = await logLineFor(session_id);
    expect(line.event).toBe("SubagentStop");
    expect(line.known).toBe(true);
    expect(line.missing).toEqual([]);
  });
});
