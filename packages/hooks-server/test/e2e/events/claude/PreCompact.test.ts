import { describe, expect, test } from "bun:test";
import { fixture, hookServer, variant } from "./kit.ts";

const hook = hookServer();

describe("e2e: PreCompact", () => {
  test("manual and auto compaction both stay passive, with no decision or blocking fields", async () => {
    for (const [trigger, instructions] of [["manual", null], ["auto", null], ["manual", "focus on tests"]] as const) {
      const res = await hook.post(variant(fixture("PreCompact"), { trigger, custom_instructions: instructions }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({});
    }
  });

  test("the log records the trigger and never the custom instruction text", async () => {
    const body = variant(fixture("PreCompact"), { trigger: "auto", custom_instructions: "PRECOMPACT-SECRET-INSTRUCTIONS" });
    await hook.post(body);
    const { entry, text } = await hook.logFor(body.session_id);
    expect(entry.trigger).toBe("auto");
    expect(text).not.toContain("PRECOMPACT-SECRET-INSTRUCTIONS");
  });

  test("a payload without custom_instructions is logged with it as missing, and still answered {}", async () => {
    const body = variant(fixture("PreCompact"), { custom_instructions: undefined });
    const res = await hook.post(body);
    expect(await res.json()).toEqual({});
    const { entry } = await hook.logFor(body.session_id);
    expect(entry.missing).toEqual(["custom_instructions"]);
  });
});
