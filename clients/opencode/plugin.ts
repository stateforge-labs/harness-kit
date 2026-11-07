// OpenCode plugin: forwards OpenCode's hooks and lifecycle events to the harness-hooks server at POST /hook/opencode.
// Install: copy this one file into OpenCode's `plugins/` config directory (it imports nothing, so it runs from there).
//
// Environment: HOOK_URL (default http://127.0.0.1:8787), HOOK_TOKEN (bearer token, never logged or printed),
// HOOK_PLUGIN_TIMEOUT_MS (default 2000).
//
// Each body is `{ ...payload, session_id, hook_event_name }`: what OpenCode passed (hooks) or the event's `data` (events) untouched,
// plus the two envelope keys every harness's body carries: the hook or event name, and a copy of OpenCode's `sessionID`. Nothing is returned to OpenCode, so the plugin changes no tool call and no permission: it only
// reports. It FAILS OPEN: an unreachable, slow or refusing server is ignored and the plugin never throws into OpenCode.
//
// The plugin form (an object with `id` and `setup(ctx)`) and the hook names were verified on opencode 2.2.6 by
// docs/research/studies/2026-11-07-codex-opencode-real-hook-payloads. Registering an unknown hook name does NOT fail, so a
// name that never fires looks the same as one that works: only names seen firing are listed as verified below.
const DEFAULT_URL = "http://127.0.0.1:8787";
const DEFAULT_TIMEOUT_MS = 2000;

/** Hooks that were seen firing on 2.2.6 (area, name). `session.compaction` is registered but was not triggered in any capture. */
const HOOKS: ReadonlyArray<readonly [area: "tool" | "permission" | "session", name: string]> = [
  ["tool", "execute.before"],
  ["tool", "execute.after"],
  ["permission", "evaluate"],
  ["session", "prompt"],
  ["session", "experimental.idle"],
  ["session", "compaction"],
];

/** Lifecycle events worth forwarding. Everything else on the stream (text and reasoning deltas, usage, ...) is far too chatty. */
const EVENTS: ReadonlySet<string> = new Set([
  "session.created",
  "session.execution.started",
  "session.execution.succeeded",
  "session.execution.failed",
  "session.execution.interrupted",
  "session.compaction.started",
  "session.compaction.ended",
  "session.compaction.failed",
]);

const timeoutMs = (() => {
  const v = process.env.HOOK_PLUGIN_TIMEOUT_MS;
  return v && /^\d+$/.test(v) && Number(v) > 0 ? Number(v) : DEFAULT_TIMEOUT_MS;
})();

/** Posts one body. Resolves in every case; a failure is dropped (fail open). */
async function send(name: string, payload: unknown): Promise<void> {
  try {
    const base = (process.env.HOOK_URL ?? DEFAULT_URL).replace(/\/+$/, "");
    const token = process.env.HOOK_TOKEN ?? "";
    const fields: Record<string, unknown> = typeof payload === "object" && payload !== null ? { ...payload } : {};
    if (typeof fields.sessionID === "string") fields.session_id = fields.sessionID;
    const body = { ...fields, hook_event_name: name };
    await fetch(`${base}/hook/opencode`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    /* fail open: nothing is reported to OpenCode */
  }
}

/** The subset of the plugin context this file uses. */
interface Ctx {
  tool: { hook(name: string, fn: (input: unknown) => Promise<void>): unknown };
  permission: { hook(name: string, fn: (input: unknown) => Promise<void>): unknown };
  session: { hook(name: string, fn: (input: unknown) => Promise<void>): unknown };
  event: { subscribe(filter: undefined, options: Record<string, never>): Promise<AsyncIterable<{ type?: unknown; data?: unknown }>> };
}

export default {
  id: "harness-hooks",
  async setup(ctx: Ctx): Promise<void> {
    for (const [area, name] of HOOKS) {
      try {
        ctx[area].hook(name, async (input: unknown) => {
          await send(`${area}.${name}`, input);
        });
      } catch {
        /* one hook failing to register must not stop the others */
      }
    }
    try {
      const stream = await ctx.event.subscribe(undefined, {});
      void (async () => {
        for await (const e of stream) {
          if (typeof e.type === "string" && EVENTS.has(e.type)) void send(e.type, e.data);
        }
      })().catch(() => {});
    } catch {
      /* no event stream: hooks still work */
    }
  },
};
