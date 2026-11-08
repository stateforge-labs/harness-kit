import { describe, expect, test } from "bun:test";
import { fixture, hookServer, variant } from "./kit.ts";

const hook = hookServer();

const PROMPT = "WORKTREE-SECRET-PROMPT";

describe("e2e: WorktreeCreate", () => {
  test("the log line records the name, and no payload text", async () => {
    const body = variant(fixture("WorktreeCreate"), { name: "calm-pine-b7c1", prompt: PROMPT });
    await hook.post(body);
    const { entry, text } = await hook.logFor(body.session_id);
    expect(entry.event).toBe("WorktreeCreate");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.name).toBe("calm-pine-b7c1");
    expect(JSON.stringify(entry)).not.toContain(PROMPT);
    expect(await hook.logText()).not.toContain(PROMPT);
    expect(text).not.toContain(PROMPT);
  });

  test("never returns hookSpecificOutput or decision fields, even with a worktreePath-like input", async () => {
    const res = await hook.post(variant(fixture("WorktreeCreate"), { name: "swift-fox-d9e8", worktreePath: "/tmp/x" }));
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({});
  });

  test("the recorded worktree name is logged", async () => {
    const body = variant(fixture("WorktreeCreate", "01"));
    const res = await hook.post(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const { entry } = await hook.logFor(body.session_id);
    expect(entry.event).toBe("WorktreeCreate");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.name).toBe("myfeat");
  });
});
