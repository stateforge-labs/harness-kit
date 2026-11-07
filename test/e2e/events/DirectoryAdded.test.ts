// What is special about DirectoryAdded. The shared checks are in ../contract.test.ts.
import { describe, expect, test } from "bun:test";
import { fixture, hookServer, variant } from "../kit.ts";

const hook = hookServer();

describe("e2e: DirectoryAdded", () => {
  test("the log line is known, has no missing keys, records source, and no directory or payload text", async () => {
    const body = variant(fixture("DirectoryAdded"), {
      source: "slash_command",
      directory: "/home/user/DIR-SECRET-PATH",
      prompt: "DIRADD-SECRET-PROMPT",
      tool_input: { command: "DIRADD-SECRET-CMD" },
    });
    await hook.post(body);
    const { entry, text } = await hook.logFor(body.session_id);
    expect(entry.event).toBe("DirectoryAdded");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.source).toBe("slash_command");
    expect(text).not.toContain("DIR-SECRET-PATH");
    expect(text).not.toContain("DIRADD-SECRET-PROMPT");
    expect(text).not.toContain("DIRADD-SECRET-CMD");
  });

  test("a payload missing source is still answered 200 with {} and logged with source in missing", async () => {
    const body = variant(fixture("DirectoryAdded"), { source: undefined });
    const res = await hook.post(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const { entry } = await hook.logFor(body.session_id);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual(["source"]);
  });

  test("the register_repo_root fixture is logged known, with no missing keys and its source recorded", async () => {
    const body = variant(fixture("DirectoryAdded", "register"));
    const res = await hook.post(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const { entry } = await hook.logFor(body.session_id);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.source).toBe("register_repo_root");
  });
});
