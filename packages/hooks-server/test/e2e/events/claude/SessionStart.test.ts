// What is special about SessionStart: the delegation rules it returns as context, for every session start type. The shared checks are in ../contract.test.ts.
import { describe, expect, test } from "bun:test";
import { fixture, hookServer, variant } from "./kit.ts";

const hook = hookServer();

describe("e2e: SessionStart", () => {
  test("the log line records source and model, and never the session title", async () => {
    const body = variant(fixture("SessionStart", "01-startup"), { model: "claude-haiku-5-5", session_title: "SS-SECRET-TITLE" });
    await hook.post(body);
    const { entry, text } = await hook.logFor(body.session_id);
    expect(entry.event).toBe("SessionStart");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.source).toBe("startup");
    expect(entry.model).toBe("claude-haiku-5-5");
    expect(text).not.toContain("SS-SECRET-TITLE");
  });

  test("a payload missing source is still answered with the context and logged with source in missing", async () => {
    const body = variant(fixture("SessionStart", "01-startup"), { source: undefined });
    const res = await hook.post(body);
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.hookSpecificOutput.hookEventName).toBe("SessionStart");
    const { entry } = await hook.logFor(body.session_id);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual(["source"]);
    expect(entry.source).toBeNull();
  });

  test("every session start type gets the context and is never blocked", async () => {
    for (const source of ["startup", "resume", "clear", "compact"]) {
      const json = (await (await hook.post(variant(fixture("SessionStart", "01-startup"), { source }))).json()) as any;
      expect(json.hookSpecificOutput.additionalContext).toStartWith("Delegation rules");
      expect(json.continue).toBeUndefined();
      expect(json.decision).toBeUndefined();
    }
  });

  test("the recorded startup fixture gets the rules and is logged with source startup", async () => {
    const body = variant(fixture("SessionStart", "01-startup"));
    const res = await hook.post(body);
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(json.hookSpecificOutput.additionalContext).toStartWith("Delegation rules (harness-hooks server):");
    const { entry } = await hook.logFor(body.session_id);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.source).toBe("startup");
  });
});
