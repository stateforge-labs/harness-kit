import { describe, expect, test } from "bun:test";
import { fixture, hookServer, variant } from "./kit.ts";
import { EnvVar } from "@homelab/harness-hooks";

const TOKEN = "t0k3n";
const SECRET_CMD = "cat SECRET-FILE-PT7";
const SECRET_OUT = "OUTPUT-BODY-PT7";
const hook = hookServer({ [EnvVar.HookToken]: TOKEN });
const post = (body: unknown) => hook.post(body, { token: TOKEN });

describe("e2e: PostToolUse", () => {
  test("the log records tool_name, duration_ms and permission_mode, but never the command or output", async () => {
    const body = variant(fixture("PostToolUse", "bash"), {
      tool_input: { command: SECRET_CMD, description: "read it" },
      tool_response: { stdout: SECRET_OUT, stderr: "", interrupted: false },
      duration_ms: 42,
    });
    await post(body);
    const { entry, text } = await hook.logFor(body.session_id);
    expect(entry.tool_name).toBe("Bash");
    expect(entry.duration_ms).toBe(42);
    expect(entry.permission_mode).toBe("default");
    expect(text).not.toContain("SECRET-FILE-PT7");
    expect(text).not.toContain(SECRET_OUT);
  });

  test("an Agent call without a return format gets no context, since the review is PreToolUse only", async () => {
    const res = await post(
      variant(fixture("PostToolUse", "agent"), {
        tool_input: { prompt: "Find all API endpoints", model: "sonnet" },
        tool_response: { status: "completed", agentId: "a1", content: [] },
      }),
    );
    expect(await res.json()).toEqual({});
  });

  test("an MCP tool logs its server name as meta, not its input", async () => {
    const body = variant(fixture("PostToolUse", "bash"), {
      tool_name: "mcp__gitlab__get_project",
      tool_input: { project_id: "group%2Fproject" },
      tool_response: { content: [] },
      mcp_server: { name: "gitlab", source: "user" },
    });
    await post(body);
    const { entry, text } = await hook.logFor(body.session_id);
    expect(entry.mcp_server).toBe("gitlab");
    expect(text).not.toContain("group%2Fproject");
  });
});
