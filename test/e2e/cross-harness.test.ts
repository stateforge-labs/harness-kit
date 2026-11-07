// The same input through different harness routes: one adapter's wording and rules never reach another's sessions.
import { describe, expect, test } from "bun:test";
import { fixture, hookServer, variant } from "./kit.ts";

const claude = hookServer("claude");
const codex = hookServer("codex");

const ADVICE = "Advisory: this Agent brief sets no return format or word limit, so ask for a short structured result.";

describe("e2e: harnesses stay apart", () => {
  test("the same spawn-shaped call is advised on Claude and answered {} on Codex", async () => {
    const c = fixture("claude", "PreToolUse", "agent");
    const advised = await (await claude.post(variant(c, { tool_input: { ...(c.payload.tool_input as object), prompt: "Find all endpoints" } }))).json();
    expect(JSON.stringify(advised)).toContain(ADVICE);

    const x = fixture("codex", "PreToolUse", "spawn");
    const passive = await (await codex.post(variant(x, { tool_input: { ...(x.payload.tool_input as object), message: "Find all endpoints" } }))).json();
    expect(passive).toEqual({});
  });

  test("a Claude payload posted to the Codex route is observed (missing keys logged), answered 200 {} and never advised", async () => {
    const c = fixture("claude", "PreToolUse", "agent");
    const body = variant(c, { tool_input: { ...(c.payload.tool_input as object), prompt: "Find all endpoints" } });
    const res = await codex.post(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const { entry } = await codex.logFor(body.session_id);
    expect(entry.harness).toBe("codex");
    expect(entry.missing).toEqual(expect.arrayContaining(["model", "turn_id"]));
  });

  test("a Codex payload posted to the Claude route is observed and answered 200", async () => {
    const x = fixture("codex", "Stop");
    const body = variant(x);
    const res = await claude.post(body);
    expect(res.status).toBe(200);
    const { entry } = await claude.logFor(body.session_id);
    expect(entry.harness).toBe("claude");
  });
});
