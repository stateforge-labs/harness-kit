import { describe, expect, test } from "bun:test";
import {
  Harness,
  Kind,
  Pipeline,
  once,
  stopGuard,
  stripToolPrefix,
  toolAllowlist,
  type Deny,
  type HookContext,
  type Middleware,
  type NeutralKind,
  type NeutralReply,
} from "../src/index.ts";

const rules = { block: [], warn: [] } as unknown as HookContext["rules"];

const ctxOf = (kind: NeutralKind, session: string | null, tool?: string): HookContext => ({
  event: { harness: Harness.Claude, kind, native: kind, session, ...(tool === undefined ? {} : { tool: { name: tool, callId: null } }) },
  rules,
  raw: {},
});

const quiet = (): Pipeline => new Pipeline({ onFault: () => {} });
const answers =
  (reply: NeutralReply): Middleware =>
  () =>
    reply;
const D: Deny = { reason: "STOCK-DENY", hint: "STOCK-HINT" };
const KEEP_GOING = { reason: "keep going", missing: ["tests"] };

describe("stopGuard", () => {
  const build = (limit: number, below: Middleware): Pipeline => quiet().use(stopGuard({ limit, reason: "fallback" }), below);

  test("passes continues through until the limit, then removes them", async () => {
    const p = build(2, answers({ continue: KEEP_GOING }));
    const ctx = ctxOf(Kind.Stop, "s1");
    expect((await p.run(ctx)).continue).toEqual(KEEP_GOING);
    expect((await p.run(ctx)).continue).toEqual(KEEP_GOING);
    expect(await p.run(ctx)).toEqual({});
    expect(await p.run(ctx)).toEqual({});
  });

  test("applies to SubagentStop and ignores other kinds", async () => {
    const p = build(0, answers({ continue: KEEP_GOING, context: "ctx" }));
    expect(await p.run(ctxOf(Kind.SubagentStop, "s1"))).toEqual({ context: "ctx" });
    expect((await p.run(ctxOf(Kind.PreTool, "s1", "Bash"))).continue).toEqual(KEEP_GOING);
    expect((await p.run(ctxOf(Kind.PostTool, "s1"))).continue).toEqual(KEEP_GOING);
  });

  test("never invents a continue", async () => {
    const p = build(3, answers({ context: "only context" }));
    expect(await p.run(ctxOf(Kind.Stop, "s1"))).toEqual({ context: "only context" });
    expect(await p.run(ctxOf(Kind.Stop, "s1"))).toEqual({ context: "only context" });
  });

  test("does not count stops that continue nothing", async () => {
    let n = 0;
    const flaky: Middleware = () => (n++ === 0 ? {} : { continue: KEEP_GOING });
    const p = build(1, flaky);
    const ctx = ctxOf(Kind.Stop, "s1");
    expect(await p.run(ctx)).toEqual({});
    expect((await p.run(ctx)).continue).toEqual(KEEP_GOING);
    expect(await p.run(ctx)).toEqual({});
  });

  test("two sessions do not share the count", async () => {
    const p = build(1, answers({ continue: KEEP_GOING }));
    expect((await p.run(ctxOf(Kind.Stop, "a"))).continue).toEqual(KEEP_GOING);
    expect((await p.run(ctxOf(Kind.Stop, "a"))).continue).toBeUndefined();
    expect((await p.run(ctxOf(Kind.Stop, "b"))).continue).toEqual(KEEP_GOING);
    expect((await p.run(ctxOf(Kind.Stop, "b"))).continue).toBeUndefined();
  });

  test("a null session is counted as one session of its own", async () => {
    const p = build(1, answers({ continue: KEEP_GOING }));
    expect((await p.run(ctxOf(Kind.Stop, null))).continue).toEqual(KEEP_GOING);
    expect((await p.run(ctxOf(Kind.Stop, null))).continue).toBeUndefined();
    expect((await p.run(ctxOf(Kind.Stop, "a"))).continue).toEqual(KEEP_GOING);
  });

  test("a deny from below is preserved with and without the continue", async () => {
    const p = build(0, answers({ continue: KEEP_GOING, deny: D }));
    expect(await p.run(ctxOf(Kind.Stop, "s1"))).toEqual({ deny: D });
    const q = build(5, answers({ continue: KEEP_GOING, deny: D }));
    expect(await q.run(ctxOf(Kind.Stop, "s1"))).toEqual({ continue: KEEP_GOING, deny: D });
  });

  test("fills the configured reason and missing list when below left them empty", async () => {
    const p = quiet().use(stopGuard({ limit: 2, reason: "finish the checklist", missing: ["tests"] }), answers({ continue: { reason: "" } }));
    expect((await p.run(ctxOf(Kind.Stop, "s1"))).continue).toEqual({ reason: "finish the checklist", missing: ["tests"] });
  });

  test("rejects a bad limit", () => {
    expect(() => stopGuard({ limit: -1, reason: "r" })).toThrow(TypeError);
    expect(() => stopGuard({ limit: 1.5, reason: "r" })).toThrow(TypeError);
  });

  test("a guard built twice keeps separate counts", async () => {
    const a = build(1, answers({ continue: KEEP_GOING }));
    const b = build(1, answers({ continue: KEEP_GOING }));
    await a.run(ctxOf(Kind.Stop, "s1"));
    expect((await a.run(ctxOf(Kind.Stop, "s1"))).continue).toBeUndefined();
    expect((await b.run(ctxOf(Kind.Stop, "s1"))).continue).toEqual(KEEP_GOING);
  });
});

describe("once", () => {
  const build = (inject: (ctx: HookContext) => string | null, below: Middleware = answers({})): Pipeline =>
    quiet().use(once(inject, { kinds: [Kind.SessionStart, Kind.PreTool] }), below);

  test("injects on the first matching event only", async () => {
    const p = build(() => "WELCOME");
    expect(await p.run(ctxOf(Kind.SessionStart, "s1"))).toEqual({ context: "WELCOME" });
    expect(await p.run(ctxOf(Kind.SessionStart, "s1"))).toEqual({});
    expect(await p.run(ctxOf(Kind.PreTool, "s1", "Bash"))).toEqual({});
  });

  test("non-matching kinds neither inject nor use up the first event", async () => {
    const p = build(() => "WELCOME");
    expect(await p.run(ctxOf(Kind.Stop, "s1"))).toEqual({});
    expect(await p.run(ctxOf(Kind.PostTool, "s1"))).toEqual({});
    expect(await p.run(ctxOf(Kind.PreTool, "s1", "Bash"))).toEqual({ context: "WELCOME" });
  });

  test("two sessions do not share state", async () => {
    const p = build(() => "WELCOME");
    expect(await p.run(ctxOf(Kind.SessionStart, "a"))).toEqual({ context: "WELCOME" });
    expect(await p.run(ctxOf(Kind.SessionStart, "b"))).toEqual({ context: "WELCOME" });
    expect(await p.run(ctxOf(Kind.SessionStart, "a"))).toEqual({});
  });

  test("a null session is one session of its own", async () => {
    const p = build(() => "WELCOME");
    expect(await p.run(ctxOf(Kind.SessionStart, null))).toEqual({ context: "WELCOME" });
    expect(await p.run(ctxOf(Kind.SessionStart, null))).toEqual({});
    expect(await p.run(ctxOf(Kind.SessionStart, "a"))).toEqual({ context: "WELCOME" });
  });

  test("a null from inject adds nothing and still uses up the first event", async () => {
    let calls = 0;
    const p = build(() => (calls++ === 0 ? null : "LATE"));
    expect(await p.run(ctxOf(Kind.SessionStart, "s1"))).toEqual({});
    expect(await p.run(ctxOf(Kind.SessionStart, "s1"))).toEqual({});
    expect(calls).toBe(1);
  });

  test("merges with the context from below and keeps its deny", async () => {
    const p = build(() => "WELCOME", answers({ context: "BELOW", deny: D }));
    expect(await p.run(ctxOf(Kind.PreTool, "s1", "Bash"))).toEqual({ context: "WELCOME\n\nBELOW", deny: D });
    expect(await p.run(ctxOf(Kind.PreTool, "s1", "Bash"))).toEqual({ context: "BELOW", deny: D });
  });

  test("hands inject the context of the event", async () => {
    const p = build((ctx) => `tool:${ctx.event.tool?.name}`);
    expect(await p.run(ctxOf(Kind.PreTool, "s1", "Bash"))).toEqual({ context: "tool:Bash" });
  });
});

describe("stripToolPrefix", () => {
  const PREFIX = "mcp__sf__";
  const seen: string[] = [];
  const spy: Middleware = (ctx, next) => {
    seen.push(ctx.event.tool?.name ?? "none");
    return next();
  };

  test("strips the prefix for the layers below and leaves the caller context alone", async () => {
    seen.length = 0;
    const original = ctxOf(Kind.PreTool, "s1", `${PREFIX}read`);
    await quiet().use(stripToolPrefix(PREFIX), spy).run(original);
    expect(seen).toEqual(["read"]);
    expect(original.event.tool?.name).toBe(`${PREFIX}read`);
  });

  test("keeps the rest of the event and the call id", async () => {
    let got: HookContext | undefined;
    const grab: Middleware = (ctx, next) => {
      got = ctx;
      return next();
    };
    const ctx: HookContext = { ...ctxOf(Kind.PreTool, "s1"), event: { ...ctxOf(Kind.PreTool, "s1").event, tool: { name: `${PREFIX}read`, callId: "c1" } } };
    await quiet().use(stripToolPrefix(PREFIX), grab).run(ctx);
    expect(got?.event).toEqual({ ...ctx.event, tool: { name: "read", callId: "c1" } });
    expect(got?.rules).toBe(ctx.rules);
    expect(got?.raw).toBe(ctx.raw);
  });

  test("leaves tools without the prefix and events without a tool untouched", async () => {
    seen.length = 0;
    const p = quiet().use(stripToolPrefix(PREFIX), spy);
    await p.run(ctxOf(Kind.PreTool, "s1", "Bash"));
    await p.run(ctxOf(Kind.PreTool, "s1", `x${PREFIX}read`));
    await p.run(ctxOf(Kind.Stop, "s1"));
    expect(seen).toEqual(["Bash", `x${PREFIX}read`, "none"]);
  });

  test("applies to every kind that carries a tool, and to a null session", async () => {
    seen.length = 0;
    const p = quiet().use(stripToolPrefix(PREFIX), spy);
    for (const kind of [Kind.PreTool, Kind.PostTool, Kind.PostToolFailure, Kind.PermissionRequest]) await p.run(ctxOf(kind, null, `${PREFIX}read`));
    expect(seen).toEqual(["read", "read", "read", "read"]);
  });

  test("an empty prefix changes nothing", async () => {
    seen.length = 0;
    await quiet().use(stripToolPrefix(""), spy).run(ctxOf(Kind.PreTool, "s1", "Bash"));
    expect(seen).toEqual(["Bash"]);
  });

  test("a deny from below is preserved", async () => {
    const p = quiet().use(stripToolPrefix(PREFIX), answers({ deny: D }));
    expect(await p.run(ctxOf(Kind.PreTool, "s1", `${PREFIX}read`))).toEqual({ deny: D });
  });

  test("toolAllowlist below it sees the bare name", async () => {
    const p = quiet().use(stripToolPrefix(PREFIX), toolAllowlist({ allow: ["read"], deny: D }));
    expect(await p.run(ctxOf(Kind.PreTool, "s1", `${PREFIX}read`))).toEqual({});
    expect(await p.run(ctxOf(Kind.PreTool, "s1", `${PREFIX}write`))).toEqual({ deny: D });
    expect(await p.run(ctxOf(Kind.PreTool, "s1", "read"))).toEqual({});
    expect(await p.run(ctxOf(Kind.PermissionRequest, "s1", `${PREFIX}read`))).toEqual({ allow: true });
  });

  test("toolAllowlist above it still sees the prefixed name", async () => {
    const p = quiet().use(toolAllowlist({ allow: ["read"], deny: D }), stripToolPrefix(PREFIX));
    expect(await p.run(ctxOf(Kind.PreTool, "s1", `${PREFIX}read`))).toEqual({ deny: D });
  });
});
