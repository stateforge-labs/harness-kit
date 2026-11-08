import { describe, expect, test } from "bun:test";
import { fixture, hookServer, variant } from "./kit.ts";

const hook = hookServer();

describe("e2e: InstructionsLoaded", () => {
  test("the log line records known, no missing keys and the meta fields, never payload text", async () => {
    const body = variant(fixture("InstructionsLoaded", "01"), {
      file_path: "/home/user/project/src/CLAUDE.md",
      load_reason: "nested_traversal",
      trigger_file_path: "/home/user/project/src/INSTRUCTIONS-SECRET-PATH.ts",
      message: "INSTR-SECRET-TEXT",
    });
    await hook.post(body);
    const { entry, text } = await hook.logFor(body.session_id);
    expect(entry.event).toBe("InstructionsLoaded");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.load_reason).toBe("nested_traversal");
    expect(entry.memory_type).toBe("Project");
    expect(text).not.toContain("INSTR-SECRET-TEXT");
    expect(text).not.toContain("INSTRUCTIONS-SECRET-PATH");
  });

  test("a payload missing a required key is still answered 200 and logged with that key in missing", async () => {
    const body = variant(fixture("InstructionsLoaded", "01"), { file_path: undefined });
    const res = await hook.post(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const { entry } = await hook.logFor(body.session_id);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual(["file_path"]);
  });

  test("the session_start fixture is answered 200, empty, and logged known with the load meta and no missing keys", async () => {
    const body = variant(fixture("InstructionsLoaded", "01"));
    const res = await hook.post(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const { entry } = await hook.logFor(body.session_id);
    expect(entry.event).toBe("InstructionsLoaded");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.load_reason).toBe("session_start");
    expect(entry.memory_type).toBe("Project");
  });
});
