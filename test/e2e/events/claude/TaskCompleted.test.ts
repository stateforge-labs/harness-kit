// What is special about TaskCompleted. The shared checks are in ../contract.test.ts.
import { describe, expect, test } from "bun:test";
import { fixture, hookServer, variant } from "./kit.ts";

const hook = hookServer();

describe("e2e: TaskCompleted", () => {
  test("the log line records teammate and agent meta, and no payload text", async () => {
    const body = variant(fixture("TaskCompleted"), {
      task_description: "TASK-SECRET-DESCRIPTION",
      teammate_name: "implementer",
      agent_id: "agent-tc-2",
      prompt: "TASK-SECRET-PROMPT",
      tool_input: { command: "TASK-SECRET-CMD" },
      message: "TASK-SECRET-MESSAGE",
    });
    await hook.post(body);
    const { entry, text } = await hook.logFor(body.session_id);
    expect(entry.event).toBe("TaskCompleted");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.teammate_name).toBe("implementer");
    expect(entry.agent_id).toBe("agent-tc-2");
    expect(text).not.toContain("TASK-SECRET-DESCRIPTION");
    expect(text).not.toContain("TASK-SECRET-PROMPT");
    expect(text).not.toContain("TASK-SECRET-CMD");
    expect(text).not.toContain("TASK-SECRET-MESSAGE");
  });

  test("a completion triggered by TaskUpdate still gets {} with no blocking fields", async () => {
    const res = await hook.post(variant(fixture("TaskCompleted"), { tool_name: "TaskUpdate", teammate_name: "reviewer" }));
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({});
    expect(body.continue).toBeUndefined();
    expect(body.decision).toBeUndefined();
    expect(body.hookSpecificOutput).toBeUndefined();
  });
});
