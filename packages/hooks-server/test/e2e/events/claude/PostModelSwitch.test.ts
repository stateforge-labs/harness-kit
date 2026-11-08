import { describe, expect, test } from "bun:test";
import { fixture, hookServer, variant } from "./kit.ts";

const hook = hookServer();

describe("e2e: PostModelSwitch", () => {
  test("the log keeps the model meta and source, and never the pricing text", async () => {
    const body = variant(fixture("PostModelSwitch"), { requested_model: null, source: "auto", pricing: "PMS-SECRET-PRICING" });
    await hook.post(body);
    const { entry, text } = await hook.logFor(body.session_id);
    expect(entry.event).toBe("PostModelSwitch");
    expect(entry.source).toBe("auto");
    expect(entry.from_model).toBe("claude-haiku-5-5");
    expect(entry.to_model).toBe("claude-opus-5-5");
    expect(entry.requested_model).toBeNull();
    expect(text).not.toContain("PMS-SECRET-PRICING");
  });

  test("stays passive for every source: no context injected, no blocking", async () => {
    for (const source of ["command", "picker", "sdk", "auto", "resume"]) {
      const res = await hook.post(variant(fixture("PostModelSwitch"), { source }));
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toEqual({});
      expect(body.hookSpecificOutput).toBeUndefined();
      expect(body.continue).toBeUndefined();
    }
  });

  test("the captured fixture from a real /model opus run logs source command and to_model opus", async () => {
    const body = fixture("PostModelSwitch").payload;
    const res = await hook.post(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const { entry } = await hook.logFor(String(body.session_id));
    expect(entry.source).toBe("command");
    expect(entry.to_model).toBe("claude-opus-5-5");
  });
});
