import { describe, expect, test } from "bun:test";
import { fixture, hookServer, variant } from "./kit.ts";

const hook = hookServer();

describe("e2e: codex PreToolUse", () => {
  test("a spawn call with no return format is answered {} (passive: the Claude advisory never reaches Codex)", async () => {
    const f = fixture("PreToolUse", "spawn");
    const body = variant(f, { tool_input: { ...(f.payload.tool_input as object), message: "Read notes.txt and tell me everything" } });
    const res = await hook.post(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  test("a payload that uses Claude's tool name `Agent` is just another tool to Codex: {}", async () => {
    const f = fixture("PreToolUse", "bash");
    const res = await hook.post(variant(f, { tool_name: "Agent", tool_input: { prompt: "find all endpoints", model: "opus" } }));
    expect(await res.json()).toEqual({});
  });

  test("the log names the spawn tool and carries no brief text", async () => {
    const f = fixture("PreToolUse", "spawn");
    const body = variant(f, { tool_input: { task_name: "SECRET-TASK", fork_turns: "all", message: "SECRET-BRIEF find all endpoints" } });
    await hook.post(body);
    const { entry, text } = await hook.logFor(body.session_id);
    expect(entry).toMatchObject({ harness: "codex", tool_name: "collaborationspawn_agent", known: true });
    expect(text).not.toContain("SECRET");
  });

  test("a Bash command is never logged", async () => {
    const f = fixture("PreToolUse", "bash");
    const body = variant(f, { tool_input: { command: "echo SECRET-COMMAND" } });
    await hook.post(body);
    const { text } = await hook.logFor(body.session_id);
    expect(text).not.toContain("SECRET-COMMAND");
  });
});
