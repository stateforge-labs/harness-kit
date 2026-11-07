// The middleware pipeline, through the real server: modules named in HOOK_MIDDLEWARE are loaded at start and wrap every event.
import { afterAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { refusesToStart, startServer, type RunningServer } from "./harness.ts";
import { fixture, variant } from "./kit.ts";

const mod = (name: string) => join(import.meta.dir, "middleware-modules", `${name}.ts`);
const started: RunningServer[] = [];
async function server(modules: string[], env: Record<string, string> = {}) {
  const srv = await startServer({ HOOK_MIDDLEWARE: modules.map(mod).join(","), ...env });
  started.push(srv);
  const post = (harness: string, body: unknown) =>
    fetch(`${srv.base}/hook/${harness}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { srv, post };
}
afterAll(() => Promise.all(started.map((s) => s.stop())));

const contextOf = (body: unknown): string | undefined => (body as { hookSpecificOutput?: { additionalContext?: string } }).hookSpecificOutput?.additionalContext;
const codexBash = () => variant(fixture("codex", "PreToolUse", "bash"));
const claudeBash = () => variant(fixture("claude", "PreToolUse", "bash"));

describe("e2e: middleware", () => {
  test("layers run outside-in: the first named wraps the second, and both wrap the built-in policy", async () => {
    const { post } = await server(["layer-a", "layer-b"]);
    const res = await post("codex", codexBash());
    const body = await res.json();
    // B is inside A, so B's text is added first and A's last.
    expect(body).toEqual({ hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: "B\n\nA" } });
  });

  test("a layer sees the neutral event and the native payload, and onKinds leaves other events alone", async () => {
    const { post } = await server(["sees-event"]);
    expect(contextOf(await (await post("codex", codexBash())).json())).toBe("harness=codex kind=pre-tool native=PreToolUse tool=Bash");
    expect(contextOf(await (await post("claude", claudeBash())).json())).toBe("harness=claude kind=pre-tool native=PreToolUse tool=Bash");
    expect(await (await post("codex", variant(fixture("codex", "Stop")))).json()).toEqual({});
  });

  test("a layer that does not call next() replaces the built-in policy's reply", async () => {
    const { post } = await server(["replaces"]);
    const res = await post("claude", variant(fixture("claude", "SessionStart")));
    expect(contextOf(await res.json())).toBe("REPLACED");
  });

  test("the same layer reaches Claude and Codex through each one's own answer format, and OpenCode (which ignores answers) gets {}", async () => {
    const { post } = await server(["layer-a"]);
    expect(contextOf(await (await post("claude", claudeBash())).json())).toBe("A");
    expect(contextOf(await (await post("codex", codexBash())).json())).toBe("A");
    expect(await (await post("opencode", variant(fixture("opencode", "tool.execute.before", "shell")))).json()).toEqual({});
  });

  test("a layer that throws is skipped: the answer is what the layers below it decided, status 200", async () => {
    const { post } = await server(["throws", "layer-a"]);
    const res = await post("codex", codexBash());
    expect(res.status).toBe(200);
    expect(contextOf(await res.json())).toBe("A");
  });

  test("a layer that never answers is skipped after HOOK_MIDDLEWARE_TIMEOUT_MS", async () => {
    const { post } = await server(["hangs", "layer-a"], { HOOK_MIDDLEWARE_TIMEOUT_MS: "250" });
    const started = performance.now();
    const res = await post("codex", codexBash());
    expect(contextOf(await res.json())).toBe("A");
    expect(performance.now() - started).toBeLessThan(3000);
  });

  test("calling next() twice runs the layers below once", async () => {
    const { post } = await server(["calls-next-twice", "counts"]);
    expect(contextOf(await (await post("codex", codexBash())).json())).toBe("runs=1");
    expect(contextOf(await (await post("codex", codexBash())).json())).toBe("runs=2");
  });
});

describe("e2e: HOOK_MIDDLEWARE is checked at start", () => {
  test.each([
    ["a relative path", { HOOK_MIDDLEWARE: "./layer.ts" }, "absolute"],
    ["a file that does not exist", { HOOK_MIDDLEWARE: "/nonexistent/layer.ts" }, "/nonexistent/layer.ts"],
    ["a module that exports no function", { HOOK_MIDDLEWARE: join(import.meta.dir, "middleware-modules/not-a-function.ts") }, "must default-export"],
    ["a bad timeout", { HOOK_MIDDLEWARE_TIMEOUT_MS: "0" }, "HOOK_MIDDLEWARE_TIMEOUT_MS"],
  ])("%s is refused with exit 2 and a message that names the problem", async (_n, env, text) => {
    const r = await refusesToStart(env);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain(text);
    expect(r.stdout).not.toContain("listening");
  });
});
