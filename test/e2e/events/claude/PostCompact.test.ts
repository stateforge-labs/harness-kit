// What is special about PostCompact: the trigger is logged, the summary never is, and unsupported output fields are ignored. The shared checks are in ../contract.test.ts.
import { describe, expect, test } from "bun:test";
import { fixture, hookServer, variant } from "./kit.ts";

const SUMMARY = "SUMMARY-SECRET-CONTENT";
const hook = hookServer();

describe("e2e: PostCompact", () => {
  test("the log keeps trigger and never the summary text", async () => {
    const body = variant(fixture("PostCompact", "auto"), { compact_summary: SUMMARY });
    await hook.post(body);
    const { entry, text } = await hook.logFor(body.session_id);
    expect(entry.trigger).toBe("auto");
    expect(entry.compact_summary).toBeUndefined();
    expect(text).not.toContain(SUMMARY);
    expect(await hook.logText()).not.toContain(SUMMARY);
  });

  test("a payload without compact_summary is still answered {} and logged with it in missing", async () => {
    const body = variant(fixture("PostCompact", "manual"), { compact_summary: undefined });
    const res = await hook.post(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const { entry } = await hook.logFor(body.session_id);
    expect(entry.missing).toEqual(["compact_summary"]);
    expect(entry.trigger).toBe("manual");
  });

  test("the response stays empty even when the payload carries an unsupported output field", async () => {
    const res = await hook.post(variant(fixture("PostCompact", "auto"), { continue: false }));
    expect(await res.json()).toEqual({});
  });

  test("the captured manual fixture logs trigger manual and no summary", async () => {
    const body = fixture("PostCompact", "manual").payload;
    await hook.post(body);
    const { entry } = await hook.logFor(String(body.session_id));
    expect(entry.trigger).toBe("manual");
    expect(entry.compact_summary).toBeUndefined();
  });

  test("the captured auto fixture logs trigger auto and no summary", async () => {
    const body = fixture("PostCompact", "auto").payload;
    await hook.post(body);
    const { entry } = await hook.logFor(String(body.session_id));
    expect(entry.trigger).toBe("auto");
    expect(entry.compact_summary).toBeUndefined();
  });
});
