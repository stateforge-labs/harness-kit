import { describe, expect, test } from "bun:test";
import { fixture, hookServer, variant } from "./kit.ts";

const hook = hookServer();

describe("e2e: StopFailure", () => {
  test("the log line is known, has no missing keys, records the error category, and no text", async () => {
    const body = variant(fixture("StopFailure", "03-server-error"), {
      error: "server_error",
      error_details: "SF-SECRET-DETAILS",
      last_assistant_message: "SF-SECRET-MESSAGE",
      prompt: "SF-SECRET-PROMPT",
      tool_input: { command: "SF-SECRET-CMD" },
    });
    await hook.post(body);
    const { entry, text } = await hook.logFor(body.session_id);
    expect(entry.event).toBe("StopFailure");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.error).toBe("server_error");
    expect(text).not.toContain("SF-SECRET-DETAILS");
    expect(text).not.toContain("SF-SECRET-MESSAGE");
    expect(text).not.toContain("SF-SECRET-PROMPT");
    expect(text).not.toContain("SF-SECRET-CMD");
  });

  test("the recorded model_not_found fixture is answered {} and logged known with error model_not_found", async () => {
    const body = variant(fixture("StopFailure", "01-model-not-found"));
    const res = await hook.post(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const { entry } = await hook.logFor(body.session_id);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.error).toBe("model_not_found");
  });

  test("never blocks, injects context, or sets terminalSequence, even when tool_name is present", async () => {
    const res = await hook.post(variant(fixture("StopFailure", "01-model-not-found"), { error: "billing_error", tool_name: "Agent" }));
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({});
    expect(body.hookSpecificOutput).toBeUndefined();
    expect(body.terminalSequence).toBeUndefined();
    expect(body.decision).toBeUndefined();
    expect(body.continue).toBeUndefined();
  });
});
