import { describe, expect, test } from "bun:test";
import { ClaudeHook, FaultSkip, Kind, Pipeline, adapters, handle } from "@stateforge-labs/harness-hooks";
import { HookPoint } from "../../../src/agent/constants.ts";
import { claudeHookCallbacks, type ClaudeHookOption, type HookCallbackBody } from "../../../src/agent/hooks/index.ts";
import {
  ALLOWED_TOOLS,
  DENY,
  SESSION_CONTEXT,
  STOP_REASON,
  fixture,
  liveFixtures,
  observer,
  stockPipeline,
  withEvent,
  type Payload,
  type Seen,
} from "./support.ts";

const claude = adapters.get("claude")!;
const SIGNAL = { signal: new AbortController().signal };

function callbackOf(option: ClaudeHookOption, event: string): HookCallbackBody {
  const entry = option[event]?.[0]?.hooks[0];
  if (!entry) throw new Error(`no callback for ${event}`);
  return entry;
}

async function fire(option: ClaudeHookOption, payload: Payload): Promise<Record<string, unknown>> {
  const event = String(payload.hook_event_name);
  const id = typeof payload.tool_use_id === "string" ? payload.tool_use_id : undefined;
  return callbackOf(option, event)(payload, id, SIGNAL);
}

describe("claudeHookCallbacks registration", () => {
  const option = claudeHookCallbacks({ pipeline: stockPipeline() }, observer());

  test("there is one matcher entry with one callback for every Claude event the decoder knows", () => {
    const known = Object.keys(claude.jsonSchemas()).sort();
    expect(Object.keys(option).sort()).toEqual(known);
    expect(Object.keys(option).sort()).toEqual(Object.values(ClaudeHook).sort());
    for (const entries of Object.values(option)) {
      expect(entries).toHaveLength(1);
      expect(entries[0]!.hooks).toHaveLength(1);
      expect(entries[0]!.matcher).toBeUndefined();
    }
  });
});

describe("the 37 live SDK payloads", () => {
  const live = liveFixtures();

  test("there are 37 of them", () => {
    expect(live).toHaveLength(37);
  });

  for (const { name, payload } of live) {
    test(`${name} decodes known and round-trips through its callback to the body harness-hooks gives`, async () => {
      const decoded = claude.decode(payload);
      expect(decoded.known).toBe(true);
      expect(decoded.missing).toEqual([]);
      expect(decoded.wrong_type).toEqual([]);
      const direct = await handle(claude, payload, stockPipeline());
      const body = await fire(claudeHookCallbacks({ pipeline: stockPipeline() }, observer()), payload);
      expect(body).toEqual(direct.body as Record<string, unknown>);
    });
  }
});

describe("deny", () => {
  test("a tool off the allowlist is denied in the body and reported once as refused", async () => {
    const heard = observer();
    const option = claudeHookCallbacks({ pipeline: stockPipeline() }, heard);
    const payload = fixture("p1-PreToolUse-1.json");
    expect(ALLOWED_TOOLS).not.toContain(payload.tool_name);
    const body = await fire(option, payload);
    expect(body).toEqual({
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: `${DENY.reason}\n${DENY.hint}` },
    });
    expect(heard.refusals).toEqual([{ id: payload.tool_use_id as string, tool: "Bash", reason: DENY.reason, text: `${DENY.reason}\n${DENY.hint}` }]);
  });

  test("an allowed tool produces no refusal", async () => {
    const heard = observer();
    const option = claudeHookCallbacks({ pipeline: stockPipeline() }, heard);
    const body = await fire(option, withEvent("p1-PreToolUse-1.json", { tool_name: "Read" }));
    expect(body).toEqual({});
    expect(heard.refusals).toEqual([]);
  });

  test("the tool name reaches the observer as the decoder gives it, prefix included", async () => {
    const heard = observer();
    const option = claudeHookCallbacks({ pipeline: stockPipeline() }, heard);
    await fire(option, withEvent("p1-PreToolUse-1.json", { tool_name: "mcp__host__secret" }));
    expect(heard.refusals.map((r) => r.tool)).toEqual(["mcp__host__secret"]);
  });
});

describe("faults", () => {
  const deny = { reason: "layer failed", hint: "closed" };

  function throwing(onFault: typeof FaultSkip | { deny: typeof deny }): Pipeline {
    return new Pipeline().use(
      function broken() {
        throw new Error("layer failure");
      },
      { onFault },
    );
  }

  test("a layer that throws under deny-on-fault produces a deny", async () => {
    const heard = observer();
    const option = claudeHookCallbacks({ pipeline: throwing({ deny }) }, heard);
    const body = await fire(option, fixture("p1-PreToolUse-1.json"));
    expect(body).toEqual({
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: `${deny.reason}\n${deny.hint}` },
    });
    expect(heard.refusals).toHaveLength(1);
  });

  test("a layer that times out under deny-on-fault produces a deny", async () => {
    const pipeline = new Pipeline().use(() => new Promise(() => {}), { onFault: { deny }, timeoutMs: 20 });
    const option = claudeHookCallbacks({ pipeline }, observer());
    const body = await fire(option, fixture("p1-PreToolUse-1.json"));
    expect((body.hookSpecificOutput as Record<string, unknown>).permissionDecision).toBe("deny");
  });

  test("a layer that throws under skip gives exactly what harness-hooks gives", async () => {
    const direct = await handle(claude, fixture("p1-PreToolUse-1.json"), throwing(FaultSkip));
    const option = claudeHookCallbacks({ pipeline: throwing(FaultSkip) }, observer());
    expect(await fire(option, fixture("p1-PreToolUse-1.json"))).toEqual(direct.body as Record<string, unknown>);
  });

  test("an observer that throws does not turn a deny into an allow", async () => {
    const hostile = {
      refused() {
        throw new Error("observer failure");
      },
      context() {
        throw new Error("observer failure");
      },
    };
    const option = claudeHookCallbacks({ pipeline: stockPipeline() }, hostile);
    const body = await fire(option, fixture("p1-PreToolUse-1.json"));
    expect((body.hookSpecificOutput as Record<string, unknown>).permissionDecision).toBe("deny");
  });
});

describe("stop continue", () => {
  test("stop_hook_active reaches the pipeline untouched and the guard owns the limit", async () => {
    const seen: Seen[] = [];
    const option = claudeHookCallbacks({ pipeline: stockPipeline(seen) }, observer());
    const first = withEvent("p1-Stop-1.json", { stop_hook_active: false });
    const second = withEvent("p1-Stop-1.json", { stop_hook_active: true });
    expect(await fire(option, first)).toEqual({ decision: "block", reason: STOP_REASON });
    expect(await fire(option, second)).toEqual({});
    const stops = seen.filter((s) => s.kind === Kind.Stop);
    expect(stops.map((s) => s.raw.stop_hook_active)).toEqual([false, true]);
  });
});

describe("post-tool failure", () => {
  test("PostToolUseFailure reaches the pipeline as a post-tool-failure event and answers with the body harness-hooks gives", async () => {
    const seen: Seen[] = [];
    const heard = observer();
    const option = claudeHookCallbacks({ pipeline: stockPipeline(seen) }, heard);
    const payload = fixture("failure/post-tool-failure.json");
    expect(await fire(option, payload)).toEqual({});
    expect(seen.map((s) => s.kind)).toEqual([Kind.PostToolFailure]);
    expect(heard.refusals).toEqual([]);
    expect(heard.contexts).toEqual([]);
  });
});

describe("the emulated session start", () => {
  test("the first prompt first runs a synthetic SessionStart from the same ids and merges its context into the reply", async () => {
    const seen: Seen[] = [];
    const heard = observer();
    const option = claudeHookCallbacks({ pipeline: stockPipeline(seen) }, heard);
    const prompt = fixture("p1-UserPromptSubmit-1.json");
    const body = await fire(option, prompt);
    expect(body).toEqual({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: SESSION_CONTEXT } });
    expect(seen.map((s) => s.kind)).toEqual([Kind.SessionStart, Kind.PromptSubmit]);
    const synthetic = seen[0]!.raw;
    expect(synthetic).toEqual({
      session_id: prompt.session_id,
      transcript_path: prompt.transcript_path,
      cwd: prompt.cwd,
      hook_event_name: "SessionStart",
      source: "startup",
    });
    expect(claude.decode(synthetic).missing).toEqual([]);
    expect(heard.contexts).toEqual([{ point: HookPoint.SessionStart, text: SESSION_CONTEXT }]);
  });

  test("it happens exactly once per run", async () => {
    const seen: Seen[] = [];
    const option = claudeHookCallbacks({ pipeline: stockPipeline(seen) }, observer());
    await fire(option, fixture("p1-UserPromptSubmit-1.json"));
    const again = await fire(option, fixture("p2-UserPromptSubmit-2.json"));
    expect(again).toEqual({});
    expect(seen.filter((s) => s.kind === Kind.SessionStart)).toHaveLength(1);
  });

  test("a resumed run builds its own callbacks and starts again", async () => {
    const seen: Seen[] = [];
    const pipeline = stockPipeline(seen);
    const first = claudeHookCallbacks({ pipeline }, observer());
    const resumed = claudeHookCallbacks({ pipeline }, observer());
    await fire(first, fixture("p1-UserPromptSubmit-1.json"));
    await fire(resumed, fixture("p2-UserPromptSubmit-2.json"));
    expect(seen.filter((s) => s.kind === Kind.SessionStart)).toHaveLength(2);
  });

  test("two runs do not share state", async () => {
    const seenA: Seen[] = [];
    const seenB: Seen[] = [];
    const a = claudeHookCallbacks({ pipeline: stockPipeline(seenA) }, observer());
    const b = claudeHookCallbacks({ pipeline: stockPipeline(seenB) }, observer());
    await fire(a, fixture("p1-UserPromptSubmit-1.json"));
    await fire(b, fixture("p1-UserPromptSubmit-1.json"));
    expect(seenA.map((s) => s.kind)).toEqual([Kind.SessionStart, Kind.PromptSubmit]);
    expect(seenB.map((s) => s.kind)).toEqual([Kind.SessionStart, Kind.PromptSubmit]);
  });

  test("a SessionStart that does fire is not followed by an emulated one", async () => {
    const seen: Seen[] = [];
    const option = claudeHookCallbacks({ pipeline: stockPipeline(seen) }, observer());
    const real = await fire(option, fixture("p1-SessionStart-1.json"));
    expect(real).toEqual({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: SESSION_CONTEXT } });
    await fire(option, fixture("p1-UserPromptSubmit-1.json"));
    expect(seen.map((s) => s.kind)).toEqual([Kind.SessionStart, Kind.PromptSubmit]);
  });

  test("a pipeline with nothing to say leaves the prompt reply as harness-hooks gives it", async () => {
    const option = claudeHookCallbacks({ pipeline: new Pipeline() }, observer());
    expect(await fire(option, fixture("p1-UserPromptSubmit-1.json"))).toEqual({});
  });

  test("the prompt's own context joins the session context", async () => {
    const pipeline = new Pipeline().use(function prompt(ctx, next) {
      return ctx.event.kind === Kind.PromptSubmit ? { context: "prompt context" } : next();
    }, { onFault: FaultSkip });
    const pipelineWithSession = new Pipeline().use(function session(ctx, next) {
      return ctx.event.kind === Kind.SessionStart ? { context: SESSION_CONTEXT } : pipeline.run(ctx);
    }, { onFault: FaultSkip });
    const heard = observer();
    const option = claudeHookCallbacks({ pipeline: pipelineWithSession }, heard);
    const body = await fire(option, fixture("p1-UserPromptSubmit-1.json"));
    expect(body).toEqual({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: `${SESSION_CONTEXT}\n\nprompt context` } });
    expect(heard.contexts.map((c) => c.point)).toEqual([HookPoint.SessionStart, HookPoint.PromptSubmit]);
  });
});
