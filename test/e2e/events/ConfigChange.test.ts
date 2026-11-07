// What is special about ConfigChange. The shared checks are in ../contract.test.ts.
import { describe, expect, test } from "bun:test";
import { fixture, hookServer, variant } from "../kit.ts";

const hook = hookServer();

describe("e2e: ConfigChange", () => {
  test("the log line records known, no missing keys and the source meta, never payload text", async () => {
    const body = variant(fixture("ConfigChange", "local"), { source: "user_settings", message: "CONFIG-SECRET-TEXT" });
    await hook.post(body);
    const { entry, text } = await hook.logFor(body.session_id);
    expect(entry.event).toBe("ConfigChange");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.source).toBe("user_settings");
    expect(text).not.toContain("CONFIG-SECRET-TEXT");
  });

  test("a payload missing the required source is still answered 200 and logged with source in missing", async () => {
    const body = variant(fixture("ConfigChange", "local"), { source: undefined });
    const res = await hook.post(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const { entry } = await hook.logFor(body.session_id);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual(["source"]);
  });

  test("the local_settings fixture is answered {} and logged known with the local_settings source and no missing keys", async () => {
    const body = variant(fixture("ConfigChange", "local"));
    const res = await hook.post(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const { entry } = await hook.logFor(body.session_id);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.source).toBe("local_settings");
  });
});
