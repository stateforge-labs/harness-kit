// What is special about PostToolBatch: the batch is logged as a count and tool names, never its payloads. The shared checks are in ../contract.test.ts.
import { describe, expect, test } from "bun:test";
import { fixture, hookServer, variant } from "../kit.ts";

const hook = hookServer();

const toolCalls = [
  {
    tool_name: "Read",
    tool_input: { file_path: "/home/user/project/src/a.ts" },
    tool_use_id: "toolu_01",
    tool_response: "1\tPRIVATE-FILE-CONTENT",
  },
  {
    tool_name: "Agent",
    tool_input: { prompt: "BRIEF-SECRET-TEXT find the endpoints", description: "Find endpoints", subagent_type: "Explore" },
    tool_use_id: "toolu_02",
    tool_response: { status: "completed", content: [{ type: "text", text: "RESULT-SECRET-TEXT" }] },
  },
];

describe("e2e: PostToolBatch", () => {
  test("the log records the count and tool names, and never the payload text", async () => {
    const body = variant(fixture("PostToolBatch"), { tool_calls: toolCalls });
    await hook.post(body);
    const { entry, text } = await hook.logFor(body.session_id);
    expect(entry.event).toBe("PostToolBatch");
    expect(entry.tool_calls).toBe(2);
    expect(entry.tool_names).toBe("Read,Agent");
    expect(text).not.toContain("BRIEF-SECRET-TEXT");
    expect(text).not.toContain("PRIVATE-FILE-CONTENT");
    expect(text).not.toContain("RESULT-SECRET-TEXT");
  });

  test("an Agent call with no return format stays passive, since the Agent review belongs to PreToolUse", async () => {
    const res = await hook.post(
      variant(fixture("PostToolBatch"), {
        tool_calls: [
          {
            tool_name: "Agent",
            tool_input: { prompt: "Find all API endpoints", model: "opus" },
            tool_use_id: "toolu_03",
            tool_response: { status: "completed" },
          },
        ],
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  test("the captured fixture is logged with one tool call, tool name Write", async () => {
    const body = fixture("PostToolBatch", "01-base").payload;
    const res = await hook.post(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const { entry } = await hook.logFor(String(body.session_id));
    expect(entry.tool_calls).toBe(1);
    expect(entry.tool_names).toBe("Write");
  });
});
