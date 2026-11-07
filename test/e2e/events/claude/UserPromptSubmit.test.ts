// What is special about UserPromptSubmit. The shared checks are in ../contract.test.ts.
import { describe, expect, test } from "bun:test";
import { fixture, hookServer, variant } from "./kit.ts";

const hook = hookServer();

const PROMPT = "UPS-SECRET-PROMPT please refactor the parser";

describe("e2e: UserPromptSubmit", () => {
  test("the log line records prompt length, permission mode and prompt id, and no prompt text", async () => {
    const body = variant(fixture("UserPromptSubmit", "01"), { prompt: PROMPT, prompt_id: "prompt-002", permission_mode: "plan" });
    await hook.post(body);
    const { entry, text } = await hook.logFor(body.session_id);
    expect(entry.event).toBe("UserPromptSubmit");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.prompt_length).toBe(PROMPT.length);
    expect(entry.permission_mode).toBe("plan");
    expect(entry.prompt_id).toBe("prompt-002");
    expect(text).not.toContain("UPS-SECRET-PROMPT");
  });

  test("prompts that ask for blocking or context get no decision, continue, or hookSpecificOutput", async () => {
    const res = await hook.post(variant(fixture("UserPromptSubmit"), { prompt: "/deploy now and block this, add context please" }));
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({});
    expect(body.decision).toBeUndefined();
    expect(body.continue).toBeUndefined();
    expect(body.hookSpecificOutput).toBeUndefined();
  });

  test("a default-mode prompt is logged with its permission mode and prompt id", async () => {
    const f = fixture("UserPromptSubmit", "02");
    const body = variant(f);
    const res = await hook.post(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const { entry } = await hook.logFor(body.session_id);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.permission_mode).toBe("default");
    expect(entry.prompt_id).toBe(f.payload.prompt_id);
  });
});
