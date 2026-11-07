import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { eventually, startServer, type RunningServer } from "../harness.ts";

// First SubagentStart line from a real headless run (captures/SubagentStart-1).
const CAPTURE_FILE = join(
  import.meta.dir,
  "../../../docs/research/studies/2026-11-07-claude-code-hook-surface/evidence/captures/SubagentStart-1/events.jsonl",
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
  hook_event_name: "SubagentStart",
});

const required = { agent_id: "agent-abc123", agent_type: "Explore" };

describe("e2e: SubagentStart", () => {
  test("a realistic payload gets the subagent rules as additionalContext and nothing else", async () => {
    const res = await post({ ...common("sub1"), ...required });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(["hookSpecificOutput"]);
    const out = body.hookSpecificOutput as Record<string, unknown>;
    expect(Object.keys(out).sort()).toEqual(["additionalContext", "hookEventName"]);
    expect(out.hookEventName).toBe("SubagentStart");
    expect(out.additionalContext).toStartWith("Subagent rules (harness-hooks server):");
  });

  test("the log line is known, has no missing keys, records agent_type, and no payload text", async () => {
    await post({ ...common("sub2"), ...required, prompt: "SUBAGENT-SECRET-PROMPT", tool_input: { command: "SUBAGENT-SECRET-CMD" } });
    const line = await logLineFor("sub2");
    const entry = JSON.parse(line!);
    expect(entry.event).toBe("SubagentStart");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.agent_type).toBe("Explore");
    expect(entry.agent_id).toBe("agent-abc123");
    expect(line).not.toContain("SUBAGENT-SECRET-PROMPT");
    expect(line).not.toContain("SUBAGENT-SECRET-CMD");
  });

  test("a payload missing agent_type is still answered 200 with the rules and logged with agent_type in missing", async () => {
    const res = await post({ ...common("sub3"), agent_id: "agent-xyz" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.hookSpecificOutput.hookEventName).toBe("SubagentStart");
    const entry = JSON.parse((await logLineFor("sub3"))!);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual(["agent_type"]);
  });

  test("context is injected for any agent type, and no decision or blocking fields are returned", async () => {
    const res = await post({ ...common("sub4"), agent_id: "agent-gp", agent_type: "general-purpose" });
    const body = (await res.json()) as Record<string, unknown>;
    expect((body.hookSpecificOutput as any).additionalContext).toStartWith("Subagent rules");
    expect(body.decision).toBeUndefined();
    expect(body.continue).toBeUndefined();
    expect(body.permissionDecision).toBeUndefined();
  });

  test("replaying the first captured SubagentStart payload gets 200, the rules, and a known log line with no missing keys", async () => {
    const first = (await Bun.file(CAPTURE_FILE).text()).split("\n")[0]!;
    const { payload } = JSON.parse(first) as { payload: Record<string, unknown> };
    expect(payload.hook_event_name).toBe("SubagentStart");
    const res = await post(payload);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(["hookSpecificOutput"]);
    const out = body.hookSpecificOutput as Record<string, unknown>;
    expect(out.hookEventName).toBe("SubagentStart");
    expect(out.additionalContext).toStartWith("Subagent rules (harness-hooks server):");
    const entry = JSON.parse((await logLineFor(payload.session_id as string))!);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.agent_type).toBe("Explore");
  });
});
