// What is special about PermissionRequest: it never decides, Agent calls get no context, and the log keeps tool meta only. The shared checks are in ../contract.test.ts.
import { describe, expect, test } from "bun:test";
import { fixture, hookServer, variant } from "../kit.ts";

const hook = hookServer();

describe("e2e: PermissionRequest", () => {
  test("the log records tool_name and permission_mode, and no command, prompt or message text", async () => {
    const body = variant(fixture("PermissionRequest", "bash"), {
      tool_input: { command: "PERM-SECRET-CMD" },
      prompt: "PERM-SECRET-PROMPT",
      message: "PERM-SECRET-MESSAGE",
    });
    await hook.post(body);
    const { entry, text } = await hook.logFor(body.session_id);
    expect(entry.event).toBe("PermissionRequest");
    expect(entry.tool_name).toBe("Bash");
    expect(entry.permission_mode).toBe("default");
    expect(text).not.toContain("PERM-SECRET-CMD");
    expect(text).not.toContain("PERM-SECRET-PROMPT");
    expect(text).not.toContain("PERM-SECRET-MESSAGE");
  });

  test("the captured fixture logs tool_name Bash and permission_mode default", async () => {
    const body = fixture("PermissionRequest", "bash").payload;
    const res = await hook.post(body);
    expect(await res.json()).toEqual({});
    const { entry } = await hook.logFor(String(body.session_id));
    expect(entry.tool_name).toBe("Bash");
    expect(entry.permission_mode).toBe("default");
  });

  test("Agent calls get {} with or without a return-format sentence, and no context is injected", async () => {
    const base = fixture("PermissionRequest", "bash");
    const noFormat = await hook.post(
      variant(base, {
        tool_name: "Agent",
        tool_input: { prompt: "Find all API endpoints", description: "Find API endpoints", subagent_type: "Explore" },
      }),
    );
    expect(await noFormat.json()).toEqual({});

    const withFormat = await hook.post(
      variant(base, {
        tool_name: "Agent",
        tool_input: { prompt: "Find all API endpoints. Return a list of at most 20 words.", description: "Find API endpoints" },
      }),
    );
    expect(await withFormat.json()).toEqual({});
  });
});
