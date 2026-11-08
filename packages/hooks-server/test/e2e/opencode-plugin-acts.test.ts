import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { startServer, type RunningServer } from "./harness.ts";
import { fixture, variant } from "./kit.ts";
import { EnvDefault, EnvVar, FailMode, setEnv } from "@homelab/harness-hooks";

type Hook = (input: unknown) => Promise<void>;
interface Plugin {
  setup(ctx: never): Promise<void>;
}

const PLUGIN_PATH = Bun.resolveSync("@homelab/harness-hooks/opencode-plugin", import.meta.dir);
const mod = (name: string) => join(import.meta.dir, "middleware-modules", `${name}.ts`);
const CONTINUE_TEXT = "V1-CONTINUE-REASON\n- V1-MISSING-1\n- V1-MISSING-2";
const restores: Array<() => void> = [];
const DEAD_URL = "http://127.0.0.1:1";

let freshCount = 0;
async function freshPlugin(): Promise<Plugin> {
  const mod = (await import(`${PLUGIN_PATH}?t=${++freshCount}`)) as { default: Plugin };
  return mod.default;
}


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

async function thrownBy(p: Promise<unknown>): Promise<Error> {
  try {
    await p;
  } catch (e) {
    return e as Error;
  }
  throw new Error("the hook did not throw");
}

const idleFor = (sessionID: string, extra: Record<string, unknown> = {}) => ({
  ...fixture("opencode", "session.experimental.idle").payload,
  ...extra,
  sessionID,
});

let denyServer: RunningServer;
let openServer: RunningServer;
let continueServer: RunningServer;
let flagServer: RunningServer;
beforeAll(async () => {
  denyServer = await startServer({ [EnvVar.HookMiddleware]: mod("v1-deny") });
  openServer = await startServer();
  continueServer = await startServer({ [EnvVar.HookMiddleware]: mod("v1-continue") });
  flagServer = await startServer({ [EnvVar.HookMiddleware]: mod("v1-opencode-plugin-acts-flag") });
});
afterAll(async () => {
  await Promise.all([denyServer, openServer, continueServer, flagServer].map((s) => s.stop()));
});

afterEach(() => {
  while (restores.length) restores.pop()!();
});

describe("e2e: the opencode plugin acts on the answers (fake ctx, real server)", () => {
  describe("tool.execute.before and tool.execute.after", () => {
    test("a deny from the server makes the registered before-hook reject with reason, newline, hint", async () => {
      restores.push(setEnv({ [EnvVar.HookUrl]: denyServer.base, [EnvVar.HookToken]: undefined }));
      const { ctx, hooks } = fakeCtx();
      const plugin = await freshPlugin();
      await plugin.setup(ctx as never);
      const err = await thrownBy(hooks.get("tool.execute.before")!(variant(fixture("opencode", "tool.execute.before", "shell"))));
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe("V1-DENY-REASON\nV1-DENY-HINT");
    });

    test("with no middleware the server's {} answer is ignored: the before-hook resolves", async () => {
      restores.push(setEnv({ [EnvVar.HookUrl]: openServer.base }));
      const { ctx, hooks } = fakeCtx();
      const plugin = await freshPlugin();
      await plugin.setup(ctx as never);
      await expect(hooks.get("tool.execute.before")!(variant(fixture("opencode", "tool.execute.before", "shell")))).resolves.toBeUndefined();
    });

    test("the after-hook never throws, even when the server answers a deny", async () => {
      restores.push(setEnv({ [EnvVar.HookUrl]: denyServer.base }));
      const { ctx, hooks } = fakeCtx();
      const plugin = await freshPlugin();
      await plugin.setup(ctx as never);
      await expect(hooks.get("tool.execute.after")!(variant(fixture("opencode", "tool.execute.after")))).resolves.toBeUndefined();
    });

    test(`server down with ${EnvVar.PluginFail}=closed: the before-hook rejects with the default reason read from the plugin source`, async () => {
      expect(EnvDefault.DenyReason).toBeTruthy();
      restores.push(setEnv({ [EnvVar.HookUrl]: DEAD_URL, [EnvVar.PluginFail]: FailMode.Closed }));
      const { ctx, hooks } = fakeCtx();
      const plugin = await freshPlugin();
      await plugin.setup(ctx as never);
      const err = await thrownBy(hooks.get("tool.execute.before")!(variant(fixture("opencode", "tool.execute.before", "shell"))));
      expect(err.message).toBe(EnvDefault.DenyReason);
    });

    test(`${EnvVar.PluginDenyReason} replaces the default fail-closed reason`, async () => {
      restores.push(setEnv({ [EnvVar.HookUrl]: DEAD_URL, [EnvVar.PluginFail]: FailMode.Closed, [EnvVar.PluginDenyReason]: "CUSTOM-CLOSED-REASON" }));
      const { ctx, hooks } = fakeCtx();
      const plugin = await freshPlugin();
      await plugin.setup(ctx as never);
      const err = await thrownBy(hooks.get("tool.execute.before")!(variant(fixture("opencode", "tool.execute.before", "shell"))));
      expect(err.message).toBe("CUSTOM-CLOSED-REASON");
    });

    test("server down with the default (fail open): the before-hook resolves", async () => {
      restores.push(setEnv({ [EnvVar.HookUrl]: DEAD_URL }));
      const { ctx, hooks } = fakeCtx();
      const plugin = await freshPlugin();
      await plugin.setup(ctx as never);
      await expect(hooks.get("tool.execute.before")!(variant(fixture("opencode", "tool.execute.before", "shell")))).resolves.toBeUndefined();
    });
  });

  describe("session.experimental.idle with a continue", () => {
    test("a continue from the server calls synthetic with the reason and the missing items, for that session", async () => {
      restores.push(setEnv({ [EnvVar.HookUrl]: continueServer.base }));
      const { ctx, hooks, calls } = fakeCtx();
      const plugin = await freshPlugin();
      await plugin.setup(ctx as never);
      await hooks.get("session.experimental.idle")!(idleFor("s-one"));
      expect(calls).toEqual([{ sessionID: "s-one", text: CONTINUE_TEXT }]);
    });

    test(`${EnvVar.PluginMaxContinues}=2: three idles on one session give two synthetic calls; another session still gets its own`, async () => {
      restores.push(setEnv({ [EnvVar.HookUrl]: continueServer.base, [EnvVar.PluginMaxContinues]: "2" }));
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
      restores.push(setEnv({ [EnvVar.HookUrl]: flagServer.base, [EnvVar.PluginMaxContinues]: "2" }));
      const { ctx, hooks, calls } = fakeCtx();
      const plugin = await freshPlugin();
      await plugin.setup(ctx as never);
      const idle = hooks.get("session.experimental.idle")!;
      await idle(idleFor("s3", { continueMe: true }));
      await idle(idleFor("s3", { continueMe: true }));
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
      restores.push(setEnv({ [EnvVar.HookUrl]: continueServer.base }));
      const { ctx, hooks, calls } = fakeCtx("none");
      const plugin = await freshPlugin();
      await plugin.setup(ctx as never);
      await expect(hooks.get("session.experimental.idle")!(idleFor("s-none"))).resolves.toBeUndefined();
      expect(calls).toEqual([]);
    });

    test("a synthetic that throws does not make the idle-hook throw", async () => {
      restores.push(setEnv({ [EnvVar.HookUrl]: continueServer.base }));
      const { ctx, hooks, calls } = fakeCtx("throw");
      const plugin = await freshPlugin();
      await plugin.setup(ctx as never);
      await expect(hooks.get("session.experimental.idle")!(idleFor("s-throws"))).resolves.toBeUndefined();
      expect(calls).toEqual([{ sessionID: "s-throws", text: CONTINUE_TEXT }]);
    });
  });
});
