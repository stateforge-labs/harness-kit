// What is special about SessionEnd: the bearer token the server checks, and the reason it logs. The shared checks are in ../contract.test.ts.
import { describe, expect, test } from "bun:test";
import { fixture, hookServer, variant } from "../kit.ts";

const TOKEN = "t0k3n";
const hook = hookServer({ HOOK_TOKEN: TOKEN });

describe("e2e: SessionEnd", () => {
  test("the log line is known, has no missing keys, carries the reason, and no prompt or command text", async () => {
    const body = variant(fixture("SessionEnd"), {
      reason: "clear",
      prompt: "SECRET-PROMPT-TEXT",
      message: "SECRET-MESSAGE-TEXT",
      tool_input: { command: "SECRET-COMMAND-TEXT" },
    });
    await hook.post(body, { token: TOKEN });
    const { entry, text } = await hook.logFor(body.session_id);
    expect(entry.event).toBe("SessionEnd");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.reason).toBe("clear");
    expect(text).not.toContain("SECRET-PROMPT-TEXT");
    expect(text).not.toContain("SECRET-MESSAGE-TEXT");
    expect(text).not.toContain("SECRET-COMMAND-TEXT");
  });

  test("the recorded fixture is answered 200 with {} and logged known with reason other", async () => {
    const body = variant(fixture("SessionEnd"));
    const res = await hook.post(body, { token: TOKEN });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const { entry } = await hook.logFor(body.session_id);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.reason).toBe("other");
  });
});
