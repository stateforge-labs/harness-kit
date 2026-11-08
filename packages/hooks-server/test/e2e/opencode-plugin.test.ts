import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import plugin from "@homelab/harness-hooks/opencode-plugin";
import { eventually, startServer, type RunningServer } from "./harness.ts";
import { EnvVar, setEnv } from "@homelab/harness-hooks";

type Hook = (input: unknown) => Promise<void>;
const SECRET = "tok-plugin-never-log-me";

function fakeCtx() {
  const hooks = new Map<string, Hook>();
  const queue: Array<{ type: string; data: unknown }> = [];
  let wake: (() => void) | undefined;
  const area = (name: string) => ({ hook: (hookName: string, fn: Hook) => void hooks.set(`${name}.${hookName}`, fn) });
  const ctx = {
    tool: area("tool"),
    permission: area("permission"),
    session: area("session"),
    event: {
      async subscribe() {
        return {
          async *[Symbol.asyncIterator]() {
            for (;;) {
              while (queue.length) yield queue.shift()!;
              await new Promise<void>((r) => (wake = r));
            }
          },
        };
      },
    },
  };
  return { ctx, hooks, push: (type: string, data: unknown) => { queue.push({ type, data }); wake?.(); } };
}

let open: RunningServer;
let guarded: RunningServer;
const restores: Array<() => void> = [];
beforeAll(async () => {
  open = await startServer();
  guarded = await startServer({ [EnvVar.HookToken]: SECRET });
});
afterAll(async () => {
  await open.stop();
  await guarded.stop();
  while (restores.length) restores.pop()!();
});

const logLine = (srv: RunningServer, sessionId: string) =>
  eventually(async () => {
    const f = Bun.file(srv.logFile);
    const text = (await f.exists()) ? await f.text() : "";
    const line = text.split("\n").find((l) => l.includes(`"session_id":"${sessionId}"`));
    return line ? (JSON.parse(line) as Record<string, any>) : undefined;
  });

describe("e2e: the opencode plugin (fake ctx, real server)", () => {
  test("registers the hooks it forwards, and has an id", async () => {
    const { ctx, hooks } = fakeCtx();
    await plugin.setup(ctx as never);
    expect(plugin.id).toBe("harness-hooks");
    expect([...hooks.keys()].sort()).toEqual([
      "permission.evaluate", "session.compaction", "session.experimental.idle", "session.prompt", "tool.execute.after", "tool.execute.before",
    ]);
  });

  test("a hook call reaches the server as an opencode event with the envelope keys added", async () => {
    restores.push(setEnv({ [EnvVar.HookUrl]: open.base, [EnvVar.HookToken]: undefined }));
    const { ctx, hooks } = fakeCtx();
    await plugin.setup(ctx as never);
    await hooks.get("tool.execute.before")!({ tool: "shell", sessionID: "plug-1", agent: "build", messageID: "m", id: "c", input: { command: "echo SECRET-CMD" } });
    const line = await logLine(open, "plug-1");
    expect(line).toMatchObject({ harness: "opencode", event: "tool.execute.before", session_id: "plug-1", tool_name: "shell", agent_type: "build", known: true, missing: [], wrong_type: [] });
    expect(JSON.stringify(line)).not.toContain("SECRET-CMD");
  });

  test("lifecycle events on the stream are forwarded, chatty ones are not", async () => {
    restores.push(setEnv({ [EnvVar.HookUrl]: open.base, [EnvVar.HookToken]: undefined }));
    const { ctx, push } = fakeCtx();
    await plugin.setup(ctx as never);
    push("session.text.delta", { sessionID: "plug-2-delta", delta: "hello" });
    push("session.execution.started", { sessionID: "plug-2" });
    expect((await logLine(open, "plug-2"))?.event).toBe("session.execution.started");
    await Bun.sleep(150);
    expect(await Bun.file(open.logFile).text()).not.toContain("plug-2-delta");
  });

  test("with a token the plugin sends it as a bearer, and never writes it to the log", async () => {
    restores.push(setEnv({ [EnvVar.HookUrl]: guarded.base, [EnvVar.HookToken]: SECRET }));
    const { ctx, hooks } = fakeCtx();
    await plugin.setup(ctx as never);
    await hooks.get("session.prompt")!({ sessionID: "plug-3", messageID: "m", delivery: "steer", prompt: { text: "SECRET-PROMPT" } });
    const line = await logLine(guarded, "plug-3");
    expect(line?.event).toBe("session.prompt");
    expect(await Bun.file(guarded.logFile).text()).not.toContain(SECRET);
  });

  test("fails open: a wrong token, a dead server and a slow server never make a hook throw or hang", async () => {
    const { ctx, hooks } = fakeCtx();
    await plugin.setup(ctx as never);
    restores.push(setEnv({ [EnvVar.HookUrl]: guarded.base, [EnvVar.HookToken]: "wrong" }));
    await hooks.get("session.experimental.idle")!({ sessionID: "plug-4", background: [] });
    expect(await Bun.file(guarded.logFile).text()).not.toContain("plug-4");

    restores.push(setEnv({ [EnvVar.HookUrl]: "http://127.0.0.1:1" }));
    await hooks.get("session.experimental.idle")!({ sessionID: "plug-5", background: [] });

    const slow = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Promise<Response>(() => {}) });
    try {
      restores.push(setEnv({ [EnvVar.HookUrl]: `http://127.0.0.1:${slow.port}`, [EnvVar.PluginTimeoutMs]: "300" }));
      const t = performance.now();
      await hooks.get("session.experimental.idle")!({ sessionID: "plug-6", background: [] });
      expect(performance.now() - t).toBeLessThan(2000);
    } finally {
      restores.push(setEnv({ [EnvVar.PluginTimeoutMs]: undefined }));
      await slow.stop(true);
    }
  });

  test("a context without an event stream or with a failing hook registration still sets up", async () => {
    const { ctx } = fakeCtx();
    const broken = { ...ctx, tool: { hook: () => { throw new Error("no such hook"); } }, event: { subscribe: async () => { throw new Error("no stream"); } } };
    await expect(plugin.setup(broken as never)).resolves.toBeUndefined();
  });
});
