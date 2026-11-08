import { describe, expect, test } from "bun:test";
import { fixture, hookServer, variant } from "./kit.ts";

const hook = hookServer();

describe("e2e: opencode events", () => {
  test("session.created says whether the session is a child (a subagent's) and logs no title, slug or ids", async () => {
    const f = fixture("session.created");
    const child = variant(f);
    const root = variant(f, { parentID: undefined });
    await hook.post(child);
    await hook.post(root);
    expect((await hook.logFor(child.session_id)).entry.is_child).toBe(true);
    expect((await hook.logFor(root.session_id)).entry.is_child).toBe(false);
  });

  test("session.execution.failed logs the failure type and never the message", async () => {
    const body = variant(fixture("session.execution.failed"), { error: { type: "provider.no-route", message: "SECRET-MESSAGE-TEXT" } });
    expect((await hook.post(body)).status).toBe(200);
    const { entry, text } = await hook.logFor(body.session_id);
    expect(entry.error_type).toBe("provider.no-route");
    expect(text).not.toContain("SECRET-MESSAGE-TEXT");
  });

  test("tool.execute.before for the subagent tool is recognised, answered {}, and its brief and model stay out of the log", async () => {
    const f = fixture("tool.execute.before", "subagent");
    const body = variant(f, { input: { agent: "general", description: "d", prompt: "SECRET-BRIEF", model: "SECRET-MODEL/x" } });
    const res = await hook.post(body);
    expect(await res.json()).toEqual({});
    const { entry, text } = await hook.logFor(body.session_id);
    expect(entry.tool_name).toBe("subagent");
    expect(text).not.toContain("SECRET");
  });

  test("a permission evaluation logs the action, effect and resource count, not the resources", async () => {
    const body = variant(fixture("permission.evaluate", "shell"), { resources: ["SECRET-COMMAND one", "SECRET-COMMAND two"] });
    await hook.post(body);
    const { entry, text } = await hook.logFor(body.session_id);
    expect(entry).toMatchObject({ action: "shell", effect: "allow", resource_count: 2 });
    expect(text).not.toContain("SECRET-COMMAND");
  });
});
