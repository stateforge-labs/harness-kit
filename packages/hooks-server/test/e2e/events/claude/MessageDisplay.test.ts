import { describe, expect, test } from "bun:test";
import { fixture, hookServer, variant } from "./kit.ts";

const hook = hookServer();

describe("e2e: MessageDisplay", () => {
  test("the log line records known, no missing keys and the meta fields, never message text", async () => {
    const body = variant(fixture("MessageDisplay"), {
      turn_id: "turn-7",
      message_id: "msg-42",
      index: 3,
      final: true,
      delta: "MD-LOG-SECRET",
    });
    await hook.post(body);
    const { entry, text } = await hook.logFor(body.session_id);
    expect(entry.event).toBe("MessageDisplay");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.index).toBe(3);
    expect(entry.final).toBe(true);
    expect(entry.message_id).toBe("msg-42");
    expect(entry.turn_id).toBe("turn-7");
    expect(text).not.toContain("MD-LOG-SECRET");
  });

  test("a payload missing the required delta is still answered 200 and logged with delta in missing", async () => {
    const body = variant(fixture("MessageDisplay"), { delta: undefined });
    const res = await hook.post(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const { entry } = await hook.logFor(body.session_id);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual(["delta"]);
  });

  test("the recorded fixture is answered {} and logged known with no missing keys, index 0 and final true", async () => {
    const body = variant(fixture("MessageDisplay"));
    const res = await hook.post(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const { entry } = await hook.logFor(body.session_id);
    expect(entry.event).toBe("MessageDisplay");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.index).toBe(0);
    expect(entry.final).toBe(true);
  });

  test("stays passive: never replaces the text with displayContent, blocks or adds context", async () => {
    const res = await hook.post(variant(fixture("MessageDisplay"), { delta: "**bold** text", final: true }));
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({});
    expect(body.hookSpecificOutput).toBeUndefined();
    expect(body.decision).toBeUndefined();
  });
});
