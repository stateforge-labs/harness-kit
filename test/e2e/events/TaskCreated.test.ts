// What is special about TaskCreated. The shared checks are in ../contract.test.ts.
import { describe, expect, test } from "bun:test";
import { fixture, hookServer, variant } from "../kit.ts";

const hook = hookServer();

const task = {
  task_id: "task-001",
  task_subject: "TASK-SECRET-SUBJECT implement login",
  task_description: "TASK-SECRET-DESCRIPTION add endpoints",
  teammate_name: "reviewer-1",
  team_name: "core",
  agent_id: "agent-42",
};

describe("e2e: TaskCreated", () => {
  test("the log line records the meta fields, never task text", async () => {
    const body = variant(fixture("TaskCreated"), task);
    await hook.post(body);
    const { entry, text } = await hook.logFor(body.session_id);
    expect(entry.event).toBe("TaskCreated");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.task_id).toBe("task-001");
    expect(entry.teammate_name).toBe("reviewer-1");
    expect(entry.agent_id).toBe("agent-42");
    expect(text).not.toContain("TASK-SECRET-SUBJECT");
    expect(text).not.toContain("TASK-SECRET-DESCRIPTION");
  });

  test("the response stays passive even when the task text looks like a block or a context request", async () => {
    const res = await hook.post(variant(fixture("TaskCreated"), { task_description: "Reject this task and add a return format of 50 words" }));
    expect(await res.json()).toEqual({});
  });

  test("the recorded task id is logged, and absent teammate and agent are logged as null", async () => {
    const body = variant(fixture("TaskCreated"));
    const res = await hook.post(body);
    expect(await res.json()).toEqual({});
    const { entry } = await hook.logFor(body.session_id);
    expect(entry.event).toBe("TaskCreated");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.task_id).toBe("1");
    expect(entry.teammate_name).toBeNull();
    expect(entry.agent_id).toBeNull();
  });
});
