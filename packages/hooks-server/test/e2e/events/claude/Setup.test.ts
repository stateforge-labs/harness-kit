import { describe, expect, test } from "bun:test";
import { fixture, hookServer, variant } from "./kit.ts";

const hook = hookServer();

describe("e2e: Setup", () => {
  test("the recorded init fixture is answered 200 with {} and logged known with no missing keys and trigger init", async () => {
    const body = variant(fixture("Setup", "01-init"));
    const res = await hook.post(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const { entry } = await hook.logFor(body.session_id);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.trigger).toBe("init");
  });

  test("the log line records the trigger and never the prompt text", async () => {
    const body = variant(fixture("Setup", "02-maintenance"), { prompt: "SETUP-SECRET-PROMPT" });
    await hook.post(body);
    const { entry, text } = await hook.logFor(body.session_id);
    expect(entry.event).toBe("Setup");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.trigger).toBe("maintenance");
    expect(text).not.toContain("SETUP-SECRET-PROMPT");
  });

  test("never returns context, decisions or blocking fields, even for an init that would get SessionStart context", async () => {
    const res = await hook.post(variant(fixture("Setup", "01-init")));
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.hookSpecificOutput).toBeUndefined();
    expect(body.decision).toBeUndefined();
    expect(body.continue).toBeUndefined();
    expect(body.systemMessage).toBeUndefined();
  });
});
