import { describe, expect, test } from "bun:test";
import { claudeMessages, fakeClaudeQuery, type FakeClaudeQueryOptions } from "../../../src/testing/index.ts";
import { collect } from "./support/subjects.ts";

function optionsOf(over: Partial<FakeClaudeQueryOptions> = {}): FakeClaudeQueryOptions {
  return {
    tools: [],
    strictMcpConfig: true,
    mcpServers: {},
    settingSources: [],
    env: {},
    cwd: "/w",
    executable: "node",
    abortController: new AbortController(),
    systemPrompt: "s",
    maxTurns: 1,
    persistSession: false,
    includePartialMessages: false,
    ...over,
  };
}

describe("fakeClaudeQuery", () => {
  test("yields the given messages and records the options and the prompt of every call", async () => {
    const messages = [claudeMessages.init(), claudeMessages.assistantText("hi"), claudeMessages.resultSuccess("hi")];
    const query = fakeClaudeQuery(messages);
    const options = optionsOf();
    expect(await collect(query({ prompt: "p1", options }))).toEqual(messages);
    const second = optionsOf({ cwd: "/other" });
    expect(await collect(query({ prompt: "p2", options: second }))).toEqual(messages);
    expect(query.calls).toEqual([options, second]);
    expect(query.calls[0]).toBe(options);
    expect(query.prompts).toEqual(["p1", "p2"]);
  });

  test("picks messages per call when given a function", async () => {
    const query = fakeClaudeQuery((call) => (call.index === 0 ? [claudeMessages.throwError("no conversation found")] : [claudeMessages.init()]));
    await expect(collect(query({ prompt: "p", options: optionsOf() }))).rejects.toThrow("no conversation found");
    expect(await collect(query({ prompt: "p", options: optionsOf() }))).toHaveLength(1);
  });

  test("after abort the next pull throws an error named like the SDK's abort error", async () => {
    const options = optionsOf();
    const stream = fakeClaudeQuery([claudeMessages.init(), claudeMessages.assistantText()])({ prompt: "p", options });
    const iterator = stream[Symbol.asyncIterator]();
    expect((await iterator.next()).done).toBe(false);
    options.abortController.abort();
    const caught = await iterator.next().then(
      () => null,
      (error: unknown) => error as Error,
    );
    expect(caught?.name).toBe("AbortError");
    expect(caught?.message).toBe("Claude Code process aborted by user");
  });

  test("holdOpen keeps the stream waiting after the last message until abort", async () => {
    const options = optionsOf();
    const stream = fakeClaudeQuery([claudeMessages.init()], { holdOpen: true })({ prompt: "p", options });
    const iterator = stream[Symbol.asyncIterator]();
    await iterator.next();
    let settled = false;
    const pending = iterator.next().then(
      () => ({ aborted: false }),
      () => ({ aborted: true }),
    );
    void pending.then(() => {
      settled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(settled).toBe(false);
    options.abortController.abort();
    expect(await pending).toEqual({ aborted: true });
  });

  test("close ends the stream, including one that is being held open", async () => {
    const stream = fakeClaudeQuery([claudeMessages.init()], { holdOpen: true })({ prompt: "p", options: optionsOf() });
    const iterator = stream[Symbol.asyncIterator]();
    await iterator.next();
    const pending = iterator.next();
    stream.close?.();
    expect((await pending).done).toBe(true);
  });

  test("delayMs spaces the messages", async () => {
    const stream = fakeClaudeQuery([claudeMessages.init(), claudeMessages.resultSuccess()], { delayMs: 30 })({ prompt: "p", options: optionsOf() });
    const started = Date.now();
    await collect(stream);
    expect(Date.now() - started).toBeGreaterThanOrEqual(50);
  });

  test("a hook directive calls the registered callbacks and records their replies without yielding", async () => {
    const seen: unknown[] = [];
    const options = optionsOf({
      hooks: {
        PreToolUse: [
          {
            hooks: [
              async (input, toolUseId) => {
                seen.push([input, toolUseId]);
                return { decision: "deny" };
              },
            ],
          },
        ],
      },
    });
    const query = fakeClaudeQuery([claudeMessages.hookCall("PreToolUse", { tool_name: "secret" }, "toolu_1"), claudeMessages.init()]);
    expect(await collect(query({ prompt: "p", options }))).toEqual([claudeMessages.init()]);
    expect(seen).toEqual([[{ tool_name: "secret" }, "toolu_1"]]);
    expect(query.hookReplies).toEqual([{ decision: "deny" }]);
  });

  test("a hook directive with no registered callback is skipped", async () => {
    const query = fakeClaudeQuery([claudeMessages.hookCall("Stop", {}), claudeMessages.init()]);
    expect(await collect(query({ prompt: "p", options: optionsOf() }))).toHaveLength(1);
    expect(query.hookReplies).toEqual([]);
  });
});

describe("claudeMessages", () => {
  test("init carries the session id, an empty tool list and the model", () => {
    const init = claudeMessages.init({ tools: ["Bash"] });
    expect(init).toMatchObject({ type: "system", subtype: "init", tools: ["Bash"] });
    expect(typeof init["session_id"]).toBe("string");
    expect(typeof init["model"]).toBe("string");
  });

  test("assistant text and tool use carry per-message usage with the cache write apart", () => {
    const text = claudeMessages.assistantText("hi", { input: 7, cacheWrite: 8, cacheRead: 9, output: 10 });
    expect(text).toMatchObject({ type: "assistant", message: { content: [{ type: "text", text: "hi" }], usage: { input_tokens: 7, cache_creation_input_tokens: 8, cache_read_input_tokens: 9, output_tokens: 10 } } });
    const tool = claudeMessages.assistantToolUse("Bash", { command: "pwd" });
    expect(tool).toMatchObject({ type: "assistant", message: { stop_reason: "tool_use", content: [{ type: "tool_use", name: "Bash", input: { command: "pwd" } }] } });
  });

  test("a tool result answers a tool use id", () => {
    expect(claudeMessages.toolResult("toolu_9", "out")).toMatchObject({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "toolu_9", content: "out", is_error: false }] } });
  });

  test("result success and max turns differ in subtype and error flag", () => {
    expect(claudeMessages.resultSuccess("done")).toMatchObject({ type: "result", subtype: "success", is_error: false, result: "done" });
    expect(claudeMessages.resultMaxTurns()).toMatchObject({ type: "result", subtype: "error_max_turns", is_error: true, terminal_reason: "max_turns" });
  });

  test("a rate limit event carries its info", () => {
    expect(claudeMessages.rateLimit()).toMatchObject({ type: "rate_limit_event", rate_limit_info: { status: "allowed_warning", rateLimitType: "seven_day" } });
  });

  test("overrides replace defaults", () => {
    expect(claudeMessages.resultSuccess("x", { num_turns: 5 })).toMatchObject({ num_turns: 5 });
  });

  test("no builder carries a home path, an email or a token", () => {
    const text = JSON.stringify([claudeMessages.init(), claudeMessages.assistantText(), claudeMessages.assistantToolUse(), claudeMessages.toolResult(), claudeMessages.resultSuccess(), claudeMessages.resultMaxTurns(), claudeMessages.rateLimit()]);
    expect(text).not.toMatch(/\/home\/|@|sk-ant|Bearer/);
  });
});
