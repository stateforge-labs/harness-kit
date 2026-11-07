// What is special about UserPromptExpansion. The shared checks are in ../contract.test.ts.
import { describe, expect, test } from "bun:test";
import { fixture, hookServer, variant } from "../kit.ts";

const hook = hookServer();

describe("e2e: UserPromptExpansion", () => {
  test("a projectSettings slash command is logged with the expansion meta", async () => {
    const body = variant(fixture("UserPromptExpansion", "projectsettings"), { command_name: "greet" });
    const res = await hook.post(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const { entry } = await hook.logFor(body.session_id);
    expect(entry.event).toBe("UserPromptExpansion");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.expansion_type).toBe("slash_command");
    expect(entry.command_name).toBe("greet");
    expect(entry.command_source).toBe("projectSettings");
  });

  test("a plugin command is answered 200 with {} and logged as plugin", async () => {
    const body = variant(fixture("UserPromptExpansion", "plugin"));
    const res = await hook.post(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const { entry } = await hook.logFor(body.session_id);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.command_name).toBe("upe-probe:cmd");
    expect(entry.command_source).toBe("plugin");
  });
});
