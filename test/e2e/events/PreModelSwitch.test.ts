// What is special about PreModelSwitch. The shared checks are in ../contract.test.ts.
import { describe, expect, test } from "bun:test";
import { fixture, hookServer, variant } from "../kit.ts";

const hook = hookServer();

// A realistic cache-warm /model switch, the values the log meta is checked against.
const warm = {
  from_model: "claude-sonnet-5",
  to_model: "claude-opus-5",
  requested_model: "opus",
  source: "command",
  context_tokens: 182340,
  prompt_cache_warm: true,
  cache_ttl: "5m",
  estimated_cache_write_usd: 1.1396,
  pricing: "catalog",
};

describe("e2e: PreModelSwitch", () => {
  test("the log line records known, no missing keys and the meta fields, never payload text", async () => {
    const body = variant(fixture("PreModelSwitch"), { ...warm, prompt: "PMS-SECRET-PROMPT", tool_input: { command: "PMS-SECRET-CMD" } });
    await hook.post(body);
    const { entry, text } = await hook.logFor(body.session_id);
    expect(entry.event).toBe("PreModelSwitch");
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.source).toBe("command");
    expect(entry.from_model).toBe("claude-sonnet-5");
    expect(entry.to_model).toBe("claude-opus-5");
    expect(entry.requested_model).toBe("opus");
    expect(entry.prompt_cache_warm).toBe(true);
    expect(entry.pricing).toBe("catalog");
    expect(text).not.toContain("PMS-SECRET-PROMPT");
    expect(text).not.toContain("PMS-SECRET-CMD");
  });

  test("never blocks, denies, asks or adds context, even for an expensive switch", async () => {
    const body = variant(fixture("PreModelSwitch"), {
      ...warm,
      requested_model: null,
      source: "sdk",
      context_tokens: 900000,
      estimated_cache_write_usd: 18.5,
    });
    const res = await hook.post(body);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json).toEqual({});
    expect(json.decision).toBeUndefined();
    expect(json.hookSpecificOutput).toBeUndefined();
  });

  test("the recorded fixture logs as known with no missing keys, with its own from_model and requested_model", async () => {
    const body = variant(fixture("PreModelSwitch"));
    await hook.post(body);
    const { entry } = await hook.logFor(body.session_id);
    expect(entry.known).toBe(true);
    expect(entry.missing).toEqual([]);
    expect(entry.from_model).toBe("claude-haiku-5-5");
    expect(entry.requested_model).toBe("opus");
  });
});
