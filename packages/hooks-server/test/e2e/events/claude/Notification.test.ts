// What is special about Notification: the notification_type meta and the message that is never logged. The shared checks are in ../contract.test.ts.
import { describe, expect, test } from "bun:test";
import { fixture, hookServer, variant } from "./kit.ts";

const hook = hookServer({ HOOK_TOKEN: "" });

describe("e2e: Notification", () => {
  test("the log keeps notification_type and never the message text", async () => {
    const body = variant(fixture("Notification"), { message: "NOTIF-SECRET-MESSAGE" });
    await hook.post(body);
    const { entry, text } = await hook.logFor(body.session_id);
    expect(entry.notification_type).toBe("permission_prompt");
    expect(text).not.toContain("NOTIF-SECRET-MESSAGE");
  });

  test("a payload without message is still answered {} and logged with message missing", async () => {
    const body = variant(fixture("Notification"), { message: undefined });
    const res = await hook.post(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const { entry } = await hook.logFor(body.session_id);
    expect(entry.missing).toEqual(["message"]);
    expect(entry.notification_type).toBe("permission_prompt");
  });

  test("the response stays empty for a notification type that would need attention", async () => {
    const res = await hook.post(variant(fixture("Notification"), { notification_type: "agent_completed" }));
    expect(await res.json()).toEqual({});
  });
});
