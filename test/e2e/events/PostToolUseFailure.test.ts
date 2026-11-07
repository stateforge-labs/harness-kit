// What is special about PostToolUseFailure: error meta (exit code, interrupt, duration) and MCP server names are logged, never the command or error text. The shared checks are in ../contract.test.ts.
import { describe, expect, test } from "bun:test";
import { fixture, hookServer, variant } from "../kit.ts";

const SECRET_CMD = "npm test SECRET-CMD-PTUF";
const SECRET_ERR = "SECRET-ERROR-BODY-PTUF";
const hook = hookServer();

describe("e2e: PostToolUseFailure", () => {
  test("the log records tool_name, is_interrupt, duration_ms and the exit code, never the command or error text", async () => {
    const body = variant(fixture("PostToolUseFailure", "bash"), {
      tool_input: { command: SECRET_CMD, description: "run tests" },
      error: `Exit code 1\n${SECRET_ERR}`,
      is_interrupt: false,
      duration_ms: 4187,
    });
    await hook.post(body);
    const { entry, text } = await hook.logFor(body.session_id);
    expect(entry.tool_name).toBe("Bash");
    expect(entry.is_interrupt).toBe(false);
    expect(entry.duration_ms).toBe(4187);
    expect(entry.error_exit_code).toBe(1);
    expect(text).not.toContain("SECRET-CMD-PTUF");
    expect(text).not.toContain(SECRET_ERR);
  });

  test("an MCP tool failure logs the server name and source, not the tool input", async () => {
    const body = variant(fixture("PostToolUseFailure", "mcp"), {
      tool_name: "mcp__files__read",
      tool_input: { path: "SECRET-PATH-PTUF" },
      error: "Tool returned an error",
      mcp_server: { name: "files", source: "user" },
    });
    await hook.post(body);
    const { entry, text } = await hook.logFor(body.session_id);
    expect(entry.mcp_server_name).toBe("files");
    expect(entry.mcp_server_source).toBe("user");
    expect(entry.error_exit_code).toBeNull();
    expect(text).not.toContain("SECRET-PATH-PTUF");
  });

  test("passive for every tool, including an Agent call, with no decision or context fields", async () => {
    for (const tool_name of ["Agent", "Read"]) {
      const res = await hook.post(
        variant(fixture("PostToolUseFailure", "bash"), {
          tool_name,
          tool_input: { prompt: "Find all API endpoints" },
          error: "failed",
        }),
      );
      expect(await res.json()).toEqual({});
    }
  });

  test("the captured fixture logs tool_name Bash and error_exit_code 2", async () => {
    const body = fixture("PostToolUseFailure", "bash").payload;
    const res = await hook.post(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const { entry } = await hook.logFor(String(body.session_id));
    expect(entry.tool_name).toBe("Bash");
    expect(entry.error_exit_code).toBe(2);
  });
});
