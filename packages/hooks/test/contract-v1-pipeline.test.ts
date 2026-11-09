import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fixturesDir } from "./fixtures-dir.ts";
import {
  Pipeline,
  adapters,
  handle,
  mergeReplies,
  policyLayer,
  toolAllowlist,
  type Deny,
  type HarnessAdapter,
  type HookContext,
  type Middleware,
  type NeutralReply,
} from "../src/index.ts";

const adapter = (id: string): HarnessAdapter => {
  const a = adapters.get(id);
  if (!a) throw new Error(`no adapter ${id}`);
  return a;
};

const load = (harness: string, event: string, file: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(fixturesDir, harness, event, file), "utf8"));

function ctxOf(harness: string, raw: Record<string, unknown>): HookContext {
  const a = adapter(harness);
  const event = a.decode(raw).event;
  if (!event) throw new Error(`${harness} fixture did not decode`);
  return { event, rules: a.rules, raw };
}

const withTool = (raw: Record<string, unknown>, tool_name: string): Record<string, unknown> => ({ ...raw, tool_name });
const withoutTool = (raw: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(raw).filter(([k]) => k !== "tool_name"));

const codexPre = (): Record<string, unknown> => load("codex", "PreToolUse", "01-bash.json");
const codexStop = (): Record<string, unknown> => load("codex", "Stop", "01-base.json");

const D: Deny = { reason: "PIPE-DENY-REASON", hint: "PIPE-DENY-HINT" };
const DENY_TEXT = "PIPE-DENY-REASON\nPIPE-DENY-HINT";
const ALLOW_DENY: Deny = { reason: "ALLOW-DENY-REASON", hint: "ALLOW-DENY-HINT" };
const ALLOW_DENY_TEXT = "ALLOW-DENY-REASON\nALLOW-DENY-HINT";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const never = (): Promise<NeutralReply> => new Promise<NeutralReply>(() => {});
const quiet = (): Pipeline => new Pipeline({ onFault: () => {} });
const passthrough: Middleware = (_ctx, next) => next();
const answers =
  (reply: NeutralReply): Middleware =>
  () =>
    reply;

beforeEach(() => {
  spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  mock.restore();
});

describe("fault modes per layer", () => {
  test("a throwing layer with onFault deny answers that deny and reports it as denied", async () => {
    const faults: string[] = [];
    const p = new Pipeline({ onFault: (m) => faults.push(m) });
    p.use(
      () => {
        throw new Error("boom");
      },
      { onFault: { deny: D } },
    );
    expect(await p.run(ctxOf("codex", codexPre()))).toEqual({ deny: D });
    expect(faults.join("\n")).toContain("denied");
  });

  test("a timed-out layer with onFault deny answers that deny and reports it as denied", async () => {
    const faults: string[] = [];
    const p = new Pipeline({ onFault: (m) => faults.push(m) });
    p.use(never, { timeoutMs: 100, onFault: { deny: D } });
    const started = performance.now();
    expect(await p.run(ctxOf("codex", codexPre()))).toEqual({ deny: D });
    expect(performance.now() - started).toBeLessThan(1500);
    expect(faults.join("\n")).toContain("timed out after 100 ms");
    expect(faults.join("\n")).toContain("denied");
  });

  test("a throwing layer with the default skip mode gives the answer of the layers below", async () => {
    const faults: string[] = [];
    const p = new Pipeline({ onFault: (m) => faults.push(m) });
    p.use(() => {
      throw new Error("boom");
    });
    p.use(answers({ context: "below" }));
    expect(await p.run(ctxOf("codex", codexPre()))).toEqual({ context: "below" });
    expect(faults.join("\n")).toContain("skipped");
  });

  test("a fault reporter that throws is contained: the answer is unchanged and run() does not throw", async () => {
    const p = new Pipeline({
      onFault: () => {
        throw new Error("reporter down");
      },
    });
    p.use(() => {
      throw new Error("boom");
    });
    p.use(answers({ context: "below" }));
    expect(await p.run(ctxOf("codex", codexPre()))).toEqual({ context: "below" });
  });

  test("a timed-out layer with skip gives the answer of the layers below", async () => {
    const p = quiet();
    p.use(never, { timeoutMs: 100, onFault: "skip" });
    p.use(answers({ context: "below" }));
    expect(await p.run(ctxOf("codex", codexPre()))).toEqual({ context: "below" });
  });
});

describe("own-time timeout", () => {
  test("time spent waiting on next() does not count: a slow layer below does not trip the outer layer", async () => {
    const p = quiet();
    p.use(
      async (_ctx, next) => await next(),
      { timeoutMs: 150, onFault: { deny: D } },
    );
    p.use(
      async () => {
        await sleep(400);
        return { context: "slow" };
      },
      { timeoutMs: 1000, onFault: "skip" },
    );
    expect(await p.run(ctxOf("codex", codexPre()))).toEqual({ context: "slow" });
  });

  test("work a layer does after next() counts against its own timeout and denies", async () => {
    const faults: string[] = [];
    const p = new Pipeline({ onFault: (m) => faults.push(m) });
    p.use(
      async (_ctx, next) => {
        const r = await next();
        await sleep(300);
        return r;
      },
      { timeoutMs: 150, onFault: { deny: D } },
    );
    p.use(answers({ context: "fast" }));
    expect(await p.run(ctxOf("codex", codexPre()))).toEqual({ deny: D });
    expect(faults.join("\n")).toContain("timed out after 150 ms");
  });
});

describe("deny wins", () => {
  test("a deny from below stays when the layer above calls next() and adds context", async () => {
    const p = quiet();
    p.use(async (_ctx, next) => {
      await next();
      return { context: "x" };
    });
    p.use(answers({ deny: D }));
    expect(await p.run(ctxOf("codex", codexPre()))).toEqual({ context: "x", deny: D });
  });

  test("a layer above cannot replace a deny from below with its own deny", async () => {
    const p = quiet();
    p.use(async (_ctx, next) => {
      await next();
      return { deny: { reason: "other" } };
    });
    p.use(answers({ deny: D }));
    expect(await p.run(ctxOf("codex", codexPre()))).toEqual({ deny: D });
  });
});

describe("mergeReplies", () => {
  test("below's deny and continue are kept over the other side's, contexts join with a blank line, allow is kept from either", () => {
    const below: NeutralReply = { context: "A", deny: D, continue: { reason: "C1" } };
    const mine: NeutralReply = { context: "B", deny: ALLOW_DENY, continue: { reason: "C2" }, allow: true };
    expect(mergeReplies(below, mine)).toEqual({ context: "A\n\nB", deny: D, continue: { reason: "C1" }, allow: true });
  });

  test("the other side's deny and continue are used when below has none; allow from either side", () => {
    expect(mergeReplies({}, { deny: D, continue: { reason: "C" } })).toEqual({ deny: D, continue: { reason: "C" } });
    expect(mergeReplies({ allow: true }, {})).toEqual({ allow: true });
    expect(mergeReplies({}, { allow: true })).toEqual({ allow: true });
  });

  test("empty contexts are not joined, and an empty merge stays empty", () => {
    expect(mergeReplies({ context: "" }, { context: "B" })).toEqual({ context: "B" });
    expect(mergeReplies({}, {})).toEqual({});
  });
});

describe("use() validation", () => {
  test("timeoutMs must be a positive number", () => {
    expect(() => quiet().use(passthrough, { timeoutMs: 0 })).toThrow(TypeError);
  });

  test("onFault must be skip or a deny", () => {
    expect(() => quiet().use(passthrough, { onFault: "nope" as never })).toThrow(TypeError);
  });

  test("a non-function in the variadic form throws", () => {
    expect(() => quiet().use(passthrough, "x" as unknown as Middleware)).toThrow(TypeError);
  });

  test("the variadic form still adds every layer, and they run in order", async () => {
    const p = quiet();
    p.use(async (_ctx, next) => mergeReplies(await next(), { context: "one" }), async () => ({ context: "two" }));
    expect(p.size).toBe(2);
    expect(await p.run(ctxOf("codex", codexPre()))).toEqual({ context: "two\n\none" });
  });
});

describe("failClosed", () => {
  test("is undefined when no layer is registered with a deny", () => {
    expect(quiet().use(passthrough).failClosed).toBeUndefined();
  });

  test("is the deny of the outermost layer registered with onFault deny", () => {
    const D2: Deny = { reason: "second" };
    const p = quiet().use(passthrough).use(passthrough, { onFault: { deny: D } }).use(passthrough, { onFault: { deny: D2 } });
    expect(p.failClosed).toEqual(D);
  });
});

describe("handle() when decode throws", () => {
  const broken = (): HarnessAdapter => ({
    ...adapter("codex"),
    decode: () => {
      throw new Error("decode broke");
    },
  });

  test("a pipeline with a deny-fault layer answers the codex PreToolUse deny body exactly", async () => {
    const p = quiet().use(passthrough, { onFault: { deny: D } });
    const { body } = await handle(broken(), codexPre(), p);
    expect(body).toEqual({
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: DENY_TEXT },
    });
  });

  test("a pipeline without a deny-fault layer answers {}", async () => {
    const p = quiet().use(policyLayer);
    expect((await handle(broken(), codexPre(), p)).body).toEqual({});
  });

  test("a Stop payload answers {} even when the pipeline is fail-closed", async () => {
    const p = quiet().use(passthrough, { onFault: { deny: D } });
    expect((await handle(broken(), codexStop(), p)).body).toEqual({});
  });
});

describe("toolAllowlist through handle() with real adapters and fixtures", () => {
  const allowlist = (allow: readonly (string | RegExp)[] | ((n: string) => boolean)) =>
    quiet().use(toolAllowlist({ allow, deny: ALLOW_DENY }), policyLayer);

  test("codex PreToolUse for an allowed tool answers {}", async () => {
    const { body } = await handle(adapter("codex"), withTool(codexPre(), "mcp__sf__submit"), allowlist(["mcp__sf__submit"]));
    expect(body).toEqual({});
  });

  test("codex PreToolUse for request_user_input, not on the list, is denied", async () => {
    const { body } = await handle(adapter("codex"), withTool(codexPre(), "request_user_input"), allowlist(["mcp__sf__submit"]));
    expect(body).toEqual({
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: ALLOW_DENY_TEXT },
    });
  });

  test("codex PermissionRequest for an allowed tool answers allow", async () => {
    const raw = withTool(load("codex", "PermissionRequest", "01-synthetic.json"), "mcp__sf__submit");
    const { body } = await handle(adapter("codex"), raw, allowlist(["mcp__sf__submit"]));
    expect(body).toEqual({ hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "allow" } } });
  });

  test("codex PermissionRequest for a disallowed tool answers deny with the message", async () => {
    const raw = withTool(load("codex", "PermissionRequest", "01-synthetic.json"), "mcp__sf__other");
    const { body } = await handle(adapter("codex"), raw, allowlist(["mcp__sf__submit"]));
    expect(body).toEqual({
      hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "deny", message: ALLOW_DENY_TEXT } },
    });
  });

  test("opencode tool.execute.before for sf_submit, allowed by a regex, answers {}", async () => {
    const raw = { ...load("opencode", "tool.execute.before", "01-shell.json"), tool: "sf_submit" };
    expect((await handle(adapter("opencode"), raw, allowlist([/^sf_/]))).body).toEqual({});
  });

  test("opencode tool.execute.before for bash, not allowed, answers { deny } with the text", async () => {
    const raw = { ...load("opencode", "tool.execute.before", "01-shell.json"), tool: "bash" };
    expect((await handle(adapter("opencode"), raw, allowlist([/^sf_/]))).body).toEqual({ deny: ALLOW_DENY_TEXT });
  });

  test("a pre-tool payload with no tool name is denied", async () => {
    const { body } = await handle(adapter("codex"), withoutTool(codexPre()), allowlist(["mcp__sf__submit"]));
    expect(body).toEqual({
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: ALLOW_DENY_TEXT },
    });
  });

  test("an opencode pre-tool payload with no tool name is denied", async () => {
    const raw = Object.fromEntries(Object.entries(load("opencode", "tool.execute.before", "01-shell.json")).filter(([k]) => k !== "tool"));
    expect((await handle(adapter("opencode"), raw, allowlist([/^sf_/]))).body).toEqual({ deny: ALLOW_DENY_TEXT });
  });

  test("non-tool events pass through unchanged, the same as without the allowlist", async () => {
    const plain = quiet().use(policyLayer);
    const claudeStart = load("claude", "SessionStart", "01-startup.json");
    expect((await handle(adapter("claude"), claudeStart, allowlist([]))).body).toEqual(
      (await handle(adapter("claude"), claudeStart, plain)).body,
    );
    expect((await handle(adapter("codex"), codexStop(), allowlist([]))).body).toEqual(
      (await handle(adapter("codex"), codexStop(), plain)).body,
    );
  });
});
