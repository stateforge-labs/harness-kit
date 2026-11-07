// What is special about Stop: the flags and message length it logs, and that it never injects context. The shared checks are in ../contract.test.ts.
import { describe, expect, test } from "bun:test";
import { fixture, hookServer, variant } from "./kit.ts";

const hook = hookServer();

describe("e2e: Stop", () => {
  test("the log line records stop_hook_active, permission_mode and message length, and no message or prompt text", async () => {
    const body = variant(fixture("Stop", "01-base"), {
      stop_hook_active: true,
      last_assistant_message: "STOP-SECRET-MESSAGE",
      prompt: "STOP-SECRET-PROMPT",
    });
    await hook.post(body);
    const { entry, text } = await hook.logFor(body.session_id);
    expect(entry.event).toBe("Stop");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.stop_hook_active).toBe(true);
    expect(entry.permission_mode).toBe("default");
    expect(entry.message_length).toBe("STOP-SECRET-MESSAGE".length);
    expect(text).not.toContain("STOP-SECRET-MESSAGE");
    expect(text).not.toContain("STOP-SECRET-PROMPT");
  });

  test("never injects context or blocks, even when the message asks for a return format", async () => {
    const res = await hook.post(
      variant(fixture("Stop", "01-base"), {
        stop_hook_active: false,
        last_assistant_message: "Please return the answer in 50 words.",
      }),
    );
    expect(await res.json()).toEqual({});
  });
});
