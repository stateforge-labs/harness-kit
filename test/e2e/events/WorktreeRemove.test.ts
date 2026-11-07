// What is special about WorktreeRemove. The shared checks are in ../contract.test.ts.
import { describe, expect, test } from "bun:test";
import { fixture, hookServer, variant } from "../kit.ts";

const hook = hookServer();

const PROMPT = "WORKTREE-REMOVE-SECRET-PROMPT";

describe("e2e: WorktreeRemove", () => {
  test("an unexpected prompt key is known, and its text never reaches the log", async () => {
    const body = variant(fixture("WorktreeRemove"), { prompt: PROMPT });
    await hook.post(body);
    const { entry, text } = await hook.logFor(body.session_id);
    expect(entry.event).toBe("WorktreeRemove");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(JSON.stringify(entry)).not.toContain(PROMPT);
    expect(text).not.toContain(PROMPT);
  });

  test("stays passive even with extra fields: no decision, no permission change, no context", async () => {
    const res = await hook.post(
      variant(fixture("WorktreeRemove"), {
        decision: "block",
        continue: false,
        hookSpecificOutput: { hookEventName: "WorktreeRemove", additionalContext: "x" },
      }),
    );
    expect(await res.json()).toEqual({});
  });
});
