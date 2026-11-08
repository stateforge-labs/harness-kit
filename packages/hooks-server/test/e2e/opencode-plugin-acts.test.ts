// The OpenCode plugin's ACTIONS (deny throws, continue calls synthetic, fail-closed/open) against the REAL server.
// DELIBERATE DEVIATION from "the real harness only over HTTP": the plugin runs inside OpenCode, so this suite drives it with a fake
// plugin ctx (as opencode-plugin.test.ts does): tool/permission/session.hook record the registered functions, and event.subscribe
// yields nothing. The plugin's own posts, and the answers it acts on, go over HTTP to the real server started with HOOK_MIDDLEWARE.
// The plugin keeps its continue counter at module level, so each test imports a fresh copy of the plugin (cache-busting query).
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { startServer, type RunningServer } from "./harness.ts";
import { fixture, variant } from "./kit.ts";

type Hook = (input: unknown) => Promise<void>;
interface Plugin {
  setup(ctx: never): Promise<void>;
}

const PLUGIN_PATH = Bun.resolveSync("@homelab/harness-hooks/opencode-plugin", import.meta.dir);
const mod = (name: string) => join(import.meta.dir, "middleware-modules", `${name}.ts`);
const CONTINUE_TEXT = "V1-CONTINUE-REASON\n- V1-MISSING-1\n- V1-MISSING-2";
const ENV_KEYS = ["HOOK_URL", "HOOK_TOKEN", "HOOK_PLUGIN_FAIL", "HOOK_PLUGIN_DENY_REASON", "HOOK_PLUGIN_MAX_CONTINUES", "HOOK_PLUGIN_TIMEOUT_MS"] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]])) as Record<string, string | undefined>;
const DEAD_URL = "http://127.0.0.1:1"; // nothing listens on port 1

let freshCount = 0;
/** A plugin module with its own continue counter: a cache-busting import gives a new module instance each call. */
async function freshPlugin(): Promise<Plugin> {
  const mod = (await import(`${PLUGIN_PATH}?t=${++freshCount}`)) as { default: Plugin };
  return mod.default;
}

/** The plugin's source, to read the default fail-closed reason from it rather than hard-coding a copy. */
const pluginSource = readFileSync(PLUGIN_PATH, "utf8");
const DEFAULT_DENY_REASON = /const DEFAULT_DENY_REASON = "([^"]+)"/.exec(pluginSource)?.[1];

/** A fake plugin context: records the hooks the plugin registers and records calls to session.synthetic. */
function fakeCtx(synthetic: "record" | "throw" | "none" = "record") {
  const hooks = new Map<string, Hook>();
  const calls: Array<{ sessionID: string; text: string }> = [];
  const session: Record<string, unknown> = { hook: (name: string, fn: Hook) => void hooks.set(`session.${name}`, fn) };
  if (synthetic !== "none") {
    session.synthetic = async (input: { sessionID: string; text: string }) => {
      calls.push(input);
      if (synthetic === "throw") throw new Error("synthetic refused");
    };
  }
  const ctx = {
    tool: { hook: (name: string, fn: Hook) => void hooks.set(`tool.${name}`, fn) },
    permission: { hook: (name: string, fn: Hook) => void hooks.set(`permission.${name}`, fn) },
    session,
    event: {
      async subscribe() {
        return { async *[Symbol.asyncIterator]() {} };
      },
    },
  };
  return { ctx, hooks, calls };
}

/** Runs a plugin's registered hook and returns what it threw, or fails the test if it did not throw. */
async function thrownBy(p: Promise<unknown>): Promise<Error> {
  try {
    await p;
  } catch (e) {
    return e as Error;
  }
  throw new Error("the hook did not throw");
}

/** An idle payload for one session, as the plugin receives it: the fixture's keys with the session id the test names. */
const idleFor = (sessionID: string, extra: Record<string, unknown> = {}) => ({
  ...fixture("opencode", "session.experimental.idle").payload,
  ...extra,
  sessionID, // last on purpose: the fixture's own sessionID would otherwise win over the one the test names
});

let denyServer: RunningServer;
let openServer: RunningServer;
let continueServer: RunningServer;
let flagServer: RunningServer;
beforeAll(async () => {
  denyServer = await startServer({ HOOK_MIDDLEWARE: mod("v1-deny") });
  openServer = await startServer();
  continueServer = await startServer({ HOOK_MIDDLEWARE: mod("v1-continue") });
  flagServer = await startServer({ HOOK_MIDDLEWARE: mod("v1-opencode-plugin-acts-flag") });
});
afterAll(async () => {
  await Promise.all([denyServer, openServer, continueServer, flagServer].map((s) => s.stop()));
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe("e2e: the opencode plugin acts on the answers (fake ctx, real server)", () => {
  describe("tool.execute.before and tool.execute.after", () => {
    test("a deny from the server makes the registered before-hook reject with reason, newline, hint", async () => {
      process.env.HOOK_URL = denyServer.base;
      delete process.env.HOOK_TOKEN;
      const { ctx, hooks } = fakeCtx();
      const plugin = await freshPlugin();
      await plugin.setup(ctx as never);
      const err = await thrownBy(hooks.get("tool.execute.before")!(variant(fixture("opencode", "tool.execute.before", "shell"))));
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe("V1-DENY-REASON\nV1-DENY-HINT");
    });

    test("with no middleware the server's {} answer is ignored: the before-hook resolves", async () => {
      process.env.HOOK_URL = openServer.base;
      const { ctx, hooks } = fakeCtx();
      const plugin = await freshPlugin();
      await plugin.setup(ctx as never);
      await expect(hooks.get("tool.execute.before")!(variant(fixture("opencode", "tool.execute.before", "shell")))).resolves.toBeUndefined();
    });

    test("the after-hook never throws, even when the server answers a deny", async () => {
      process.env.HOOK_URL = denyServer.base;
      const { ctx, hooks } = fakeCtx();
      const plugin = await freshPlugin();
      await plugin.setup(ctx as never);
      await expect(hooks.get("tool.execute.after")!(variant(fixture("opencode", "tool.execute.after")))).resolves.toBeUndefined();
    });

    test("server down with HOOK_PLUGIN_FAIL=closed: the before-hook rejects with the default reason read from the plugin source", async () => {
      expect(DEFAULT_DENY_REASON).toBeTruthy();
      process.env.HOOK_URL = DEAD_URL;
      process.env.HOOK_PLUGIN_FAIL = "closed";
      const { ctx, hooks } = fakeCtx();
      const plugin = await freshPlugin();
      await plugin.setup(ctx as never);
      const err = await thrownBy(hooks.get("tool.execute.before")!(variant(fixture("opencode", "tool.execute.before", "shell"))));
      expect(err.message).toBe(DEFAULT_DENY_REASON!);
    });

    test("HOOK_PLUGIN_DENY_REASON replaces the default fail-closed reason", async () => {
      process.env.HOOK_URL = DEAD_URL;
      process.env.HOOK_PLUGIN_FAIL = "closed";
      process.env.HOOK_PLUGIN_DENY_REASON = "CUSTOM-CLOSED-REASON";
      const { ctx, hooks } = fakeCtx();
      const plugin = await freshPlugin();
      await plugin.setup(ctx as never);
      const err = await thrownBy(hooks.get("tool.execute.before")!(variant(fixture("opencode", "tool.execute.before", "shell"))));
      expect(err.message).toBe("CUSTOM-CLOSED-REASON");
    });

    test("server down with the default (fail open): the before-hook resolves", async () => {
      process.env.HOOK_URL = DEAD_URL;
      const { ctx, hooks } = fakeCtx();
      const plugin = await freshPlugin();
      await plugin.setup(ctx as never);
      await expect(hooks.get("tool.execute.before")!(variant(fixture("opencode", "tool.execute.before", "shell")))).resolves.toBeUndefined();
    });
  });

  describe("session.experimental.idle with a continue", () => {
    test("a continue from the server calls synthetic with the reason and the missing items, for that session", async () => {
      process.env.HOOK_URL = continueServer.base;
      const { ctx, hooks, calls } = fakeCtx();
      const plugin = await freshPlugin();
      await plugin.setup(ctx as never);
      await hooks.get("session.experimental.idle")!(idleFor("s-one"));
      expect(calls).toEqual([{ sessionID: "s-one", text: CONTINUE_TEXT }]);
    });

    test("HOOK_PLUGIN_MAX_CONTINUES=2: three idles on one session give two synthetic calls; another session still gets its own", async () => {
      process.env.HOOK_URL = continueServer.base;
      process.env.HOOK_PLUGIN_MAX_CONTINUES = "2";
      const { ctx, hooks, calls } = fakeCtx();
      const plugin = await freshPlugin();
      await plugin.setup(ctx as never);
      const idle = hooks.get("session.experimental.idle")!;
      await idle(idleFor("s1"));
      await idle(idleFor("s1"));
      await idle(idleFor("s1"));
      expect(calls.filter((c) => c.sessionID === "s1")).toEqual([
        { sessionID: "s1", text: CONTINUE_TEXT },
        { sessionID: "s1", text: CONTINUE_TEXT },
      ]);
      await idle(idleFor("s2"));
      expect(calls.filter((c) => c.sessionID === "s2")).toEqual([{ sessionID: "s2", text: CONTINUE_TEXT }]);
      expect(calls).toHaveLength(3);
    });

    test("an idle answered without a continue resets the count for that session", async () => {
      process.env.HOOK_URL = flagServer.base;
      process.env.HOOK_PLUGIN_MAX_CONTINUES = "2";
      const { ctx, hooks, calls } = fakeCtx();
      const plugin = await freshPlugin();
      await plugin.setup(ctx as never);
      const idle = hooks.get("session.experimental.idle")!;
      await idle(idleFor("s3", { continueMe: true }));
      await idle(idleFor("s3", { continueMe: true }));
      // capped now: this one is not continued, and the server answers {} (no continue), which resets the count
      await idle(idleFor("s3"));
      expect(calls).toHaveLength(2);
      await idle(idleFor("s3", { continueMe: true }));
      expect(calls.filter((c) => c.sessionID === "s3")).toEqual([
        { sessionID: "s3", text: CONTINUE_TEXT },
        { sessionID: "s3", text: CONTINUE_TEXT },
        { sessionID: "s3", text: CONTINUE_TEXT },
      ]);
    });

    test("with no synthetic function on ctx, the idle-hook resolves without throwing", async () => {
      process.env.HOOK_URL = continueServer.base;
      const { ctx, hooks, calls } = fakeCtx("none");
      const plugin = await freshPlugin();
      await plugin.setup(ctx as never);
      await expect(hooks.get("session.experimental.idle")!(idleFor("s-none"))).resolves.toBeUndefined();
      expect(calls).toEqual([]);
    });

    test("a synthetic that throws does not make the idle-hook throw", async () => {
      process.env.HOOK_URL = continueServer.base;
      const { ctx, hooks, calls } = fakeCtx("throw");
      const plugin = await freshPlugin();
      await plugin.setup(ctx as never);
      await expect(hooks.get("session.experimental.idle")!(idleFor("s-throws"))).resolves.toBeUndefined();
      expect(calls).toEqual([{ sessionID: "s-throws", text: CONTINUE_TEXT }]);
    });
  });
});
