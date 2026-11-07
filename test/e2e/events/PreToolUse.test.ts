// What is special about PreToolUse: advice on Agent briefs. The shared checks are in ../contract.test.ts.
import { describe, expect, test } from "bun:test";
import { fixture, hookServer, variant } from "../kit.ts";

const hook = hookServer();

const ADVICE_NO_FORMAT = "Advisory: this Agent brief sets no return format or word limit, so ask for a short structured result.";
const ADVICE_MODEL = "Advisory: this Agent call sets a non-Haiku model, so confirm that the cost is intended.";

const agentCall = (input: Record<string, unknown>) => {
  const f = fixture("PreToolUse", "agent");
  return variant(f, { tool_input: { ...(f.payload.tool_input as object), ...input } });
};
const answer = async (input: Record<string, unknown>) => (await hook.post(agentCall(input))).json();

describe("e2e: PreToolUse", () => {
  test("an Agent brief with no return format gets exactly the no-format advisory", async () => {
    const body = await answer({ prompt: "Find all endpoints in the repo" });
    expect(body).toEqual({ hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: ADVICE_NO_FORMAT } });
  });

  test("an Agent brief with a return format and no model override gets {}", async () => {
    expect(await answer({ prompt: "Find endpoints. Return a list under 100 words." })).toEqual({});
  });

  test("a return format with a non-Haiku model gets the model advisory", async () => {
    const body = (await answer({ prompt: "Find endpoints. Return a list.", model: "opus" })) as any;
    expect(body.hookSpecificOutput.additionalContext).toBe(ADVICE_MODEL);
  });

  test("a return format with model haiku gets {}", async () => {
    expect(await answer({ prompt: "Find endpoints. Return a list.", model: "haiku" })).toEqual({});
  });

  test("the log records tool_name, subagent_type, model and advised, and no brief text", async () => {
    const body = agentCall({ prompt: "PRETOOL-SECRET-PROMPT find all endpoints", description: "PRETOOL-SECRET-DESC", subagent_type: "Explore", model: "sonnet" });
    await hook.post(body);
    const { entry, text } = await hook.logFor(body.session_id);
    expect(entry).toMatchObject({ tool_name: "Agent", subagent_type: "Explore", model: "sonnet", advised: true });
    expect(text).not.toContain("PRETOOL-SECRET");
  });

  test("non-Agent tools get {} and never a permission or block field", async () => {
    const body = (await (await hook.post(variant(fixture("PreToolUse", "bash")))).json()) as Record<string, unknown>;
    expect(body).toEqual({});
  });
});
