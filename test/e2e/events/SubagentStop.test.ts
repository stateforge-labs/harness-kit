// What is special about SubagentStop: the subagent meta it logs, and that it never blocks or returns context. The shared checks are in ../contract.test.ts.
import { describe, expect, test } from "bun:test";
import { fixture, hookServer, variant } from "../kit.ts";

const SECRET_MSG = "SUBAGENT-FINAL-SECRET-SS7";
const SECRET_PROMPT = "SUBAGENT-PROMPT-SECRET-SS7";
const hook = hookServer();

describe("e2e: SubagentStop", () => {
  test("the log is known, has no missing keys, records meta, and never the message or prompt text", async () => {
    const body = variant(fixture("SubagentStop", "02-base"), {
      agent_id: "a2",
      agent_type: "general-purpose",
      permission_mode: "default",
      stop_hook_active: false,
      last_assistant_message: SECRET_MSG,
      prompt: SECRET_PROMPT,
      effort: { level: "medium" },
    });
    await hook.post(body);
    const { entry, text } = await hook.logFor(body.session_id);
    expect(entry.event).toBe("SubagentStop");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.agent_type).toBe("general-purpose");
    expect(entry.agent_id).toBe("a2");
    expect(entry.stop_hook_active).toBe(false);
    expect(entry.permission_mode).toBe("default");
    expect(entry.effort_level).toBe("medium");
    expect(text).not.toContain(SECRET_MSG);
    expect(text).not.toContain(SECRET_PROMPT);
  });

  test("never returns a decision, a block or context, even when stop_hook_active is true", async () => {
    const res = await hook.post(variant(fixture("SubagentStop", "02-base"), { agent_id: "a4", stop_hook_active: true, last_assistant_message: SECRET_MSG }));
    expect(await res.json()).toEqual({});
  });
});
