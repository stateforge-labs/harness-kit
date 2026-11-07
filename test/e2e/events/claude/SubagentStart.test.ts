// What is special about SubagentStart: the subagent rules it returns for any agent type, and the agent fields it logs. The shared checks are in ../contract.test.ts.
import { describe, expect, test } from "bun:test";
import { fixture, hookServer, variant } from "./kit.ts";

const hook = hookServer();

describe("e2e: SubagentStart", () => {
  test("the log line records agent_type and agent_id, and no payload text", async () => {
    const body = variant(fixture("SubagentStart", "01-base"), {
      agent_id: "agent-abc123",
      agent_type: "Explore",
      prompt: "SUBAGENT-SECRET-PROMPT",
      tool_input: { command: "SUBAGENT-SECRET-CMD" },
    });
    await hook.post(body);
    const { entry, text } = await hook.logFor(body.session_id);
    expect(entry.event).toBe("SubagentStart");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.agent_type).toBe("Explore");
    expect(entry.agent_id).toBe("agent-abc123");
    expect(text).not.toContain("SUBAGENT-SECRET-PROMPT");
    expect(text).not.toContain("SUBAGENT-SECRET-CMD");
  });

  test("a payload missing agent_type is still answered 200 with the rules and logged with agent_type in missing", async () => {
    const body = variant(fixture("SubagentStart", "01-base"), { agent_id: "agent-xyz", agent_type: undefined });
    const res = await hook.post(body);
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.hookSpecificOutput.hookEventName).toBe("SubagentStart");
    const { entry } = await hook.logFor(body.session_id);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual(["agent_type"]);
  });

  test("context is injected for any agent type, and no decision or blocking fields are returned", async () => {
    const res = await hook.post(variant(fixture("SubagentStart", "01-base"), { agent_id: "agent-gp", agent_type: "general-purpose" }));
    const json = (await res.json()) as Record<string, unknown>;
    expect((json.hookSpecificOutput as any).additionalContext).toStartWith("Subagent rules");
    expect(json.decision).toBeUndefined();
    expect(json.continue).toBeUndefined();
    expect(json.permissionDecision).toBeUndefined();
  });

  test("the recorded fixture gets 200, the rules, and a known log line with no missing keys and agent_type general-purpose", async () => {
    const body = variant(fixture("SubagentStart", "01-base"));
    const res = await hook.post(body);
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(json)).toEqual(["hookSpecificOutput"]);
    const out = json.hookSpecificOutput as Record<string, unknown>;
    expect(out.hookEventName).toBe("SubagentStart");
    expect(out.additionalContext).toStartWith("Subagent rules (harness-hooks server):");
    const { entry } = await hook.logFor(body.session_id);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.agent_type).toBe("general-purpose");
  });
});
