import { describe, expect, test } from "bun:test";
import { fixture, hookServer, variant } from "./kit.ts";

const hook = hookServer();

describe("e2e: Elicitation", () => {
  test("the log line records known, no missing keys and the server and mode meta, never the message text", async () => {
    const body = variant(fixture("Elicitation", "01"), { mcp_server_name: "my-mcp-server", message: "ELICIT-SECRET-TEXT", mode: "url" });
    await hook.post(body);
    const { entry, text } = await hook.logFor(body.session_id);
    expect(entry.event).toBe("Elicitation");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.mcp_server_name).toBe("my-mcp-server");
    expect(entry.mode).toBe("url");
    expect(text).not.toContain("ELICIT-SECRET-TEXT");
  });

  test("a payload missing the required message is still answered 200 and logged with message in missing", async () => {
    const body = variant(fixture("Elicitation", "01"), { message: undefined });
    const res = await hook.post(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const { entry } = await hook.logFor(body.session_id);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual(["message"]);
  });

  test("the form-mode fixture is logged known with no missing keys and its server and mode meta", async () => {
    const body = variant(fixture("Elicitation", "01"));
    const res = await hook.post(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const { entry } = await hook.logFor(body.session_id);
    expect(entry.event).toBe("Elicitation");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.mcp_server_name).toBe("elicit");
    expect(entry.mode).toBe("form");
  });
});
