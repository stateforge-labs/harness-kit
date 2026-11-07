// What is special about ElicitationResult. The shared checks are in ../contract.test.ts.
import { describe, expect, test } from "bun:test";
import { fixture, hookServer, variant } from "./kit.ts";

const hook = hookServer();

describe("e2e: ElicitationResult", () => {
  test("the log line records known, no missing keys and the meta fields, never payload text", async () => {
    const body = variant(fixture("ElicitationResult", "01"), {
      mcp_server_name: "github",
      action: "decline",
      mode: "form",
      elicitation_id: "elic-2",
      content: { token: "ER-SECRET-CONTENT" },
    });
    await hook.post(body);
    const { entry, text } = await hook.logFor(body.session_id);
    expect(entry.event).toBe("ElicitationResult");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.mcp_server_name).toBe("github");
    expect(entry.action).toBe("decline");
    expect(entry.mode).toBe("form");
    expect(entry.elicitation_id).toBe("elic-2");
    expect(text).not.toContain("ER-SECRET-CONTENT");
  });

  test("a payload missing the required action is still answered 200 and logged with action in missing", async () => {
    const body = variant(fixture("ElicitationResult", "01"), { action: undefined });
    const res = await hook.post(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const { entry } = await hook.logFor(body.session_id);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual(["action"]);
  });

  test("the cancel fixture is logged known with its mcp_server_name, action and mode meta and no missing keys", async () => {
    const body = variant(fixture("ElicitationResult", "01"));
    const res = await hook.post(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const { entry } = await hook.logFor(body.session_id);
    expect(entry.event).toBe("ElicitationResult");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.mcp_server_name).toBe("elicit");
    expect(entry.action).toBe("cancel");
    expect(entry.mode).toBe("form");
  });
});
