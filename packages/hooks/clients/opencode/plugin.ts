// OpenCode plugin: forwards OpenCode's hooks and lifecycle events to the harness-hooks server at POST /hook/opencode, and acts on
// the answer. Install: copy this one file into OpenCode's `plugins/` config directory (it imports nothing, so it runs from there).
//
// Environment: HOOK_URL (default http://127.0.0.1:8787), HOOK_TOKEN (bearer token, never logged or printed),
// HOOK_PLUGIN_TIMEOUT_MS (default 5000), HOOK_PLUGIN_FAIL=open|closed (default open), HOOK_PLUGIN_DENY_REASON (closed-mode text),
// HOOK_PLUGIN_MAX_CONTINUES (default 8).
//
// Each body is `{ ...payload, session_id, hook_event_name }`: what OpenCode passed (hooks) or the event's `data` (events) untouched,
// plus the two envelope keys every harness's body carries: the hook or event name, and a copy of OpenCode's `sessionID`.
//
// What it does with the answer (contract v1; measured on 2.2.6 in R-2026-11-07-10, `opencode/q4-throw-deny`, `q4-idle-continue`):
// - `tool.execute.before` answered `{ deny: text }`: the hook throws `Error(text)`, so the tool does not run and the model sees text.
// - `session.experimental.idle` answered `{ continue: text }`: the text goes back as a synthetic user message, so the agent goes on.
//   At most HOOK_PLUGIN_MAX_CONTINUES times in a row per session (the count resets when an idle is not continued), the same cap
//   Claude Code puts on Stop continuations, so a layer that always says continue cannot loop forever.
// Every other answer is ignored. By default it FAILS OPEN: an unreachable, slow or refusing server is ignored. With
// HOOK_PLUGIN_FAIL=closed, a failed `tool.execute.before` post throws HOOK_PLUGIN_DENY_REASON instead. OpenCode waits for a hook
// as long as it takes (75 s seen, R-2026-11-07-10 F14), so this plugin's own timeout is the one that decides.
//
// The plugin form (an object with `id` and `setup(ctx)`) and the hook names were verified on opencode 2.2.6 by
// docs/research/studies/2026-11-07-codex-opencode-real-hook-payloads. Registering an unknown hook name does NOT fail, so a
// name that never fires looks the same as one that works: only names seen firing are listed as verified below.
const DEFAULT_URL = "http://127.0.0.1:8787";
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_DENY_REASON = "harness-hooks: the hook server did not answer, so this call is refused (fail-closed).";
const DEFAULT_MAX_CONTINUES = 8;

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

/** Read on every post, like HOOK_URL and HOOK_TOKEN, so a change to the environment takes effect without reloading the plugin. */
function positive(name: string, fallback: number): number {
  const v = process.env[name];
  return v && /^\d+$/.test(v) && Number(v) > 0 ? Number(v) : fallback;
}

/** The server's answer, or null when the post failed (unreachable, slow, not 200, not a JSON object). */
type Answer = Record<string, unknown> | null;

/** Posts one body and reads the answer. Never throws. */
async function send(name: string, payload: unknown): Promise<Answer> {
  try {
    const base = (process.env.HOOK_URL ?? DEFAULT_URL).replace(/\/+$/, "");
    const token = process.env.HOOK_TOKEN ?? "";
    const fields: Record<string, unknown> = typeof payload === "object" && payload !== null ? { ...payload } : {};
    if (typeof fields.sessionID === "string") fields.session_id = fields.sessionID;
    const body = { ...fields, hook_event_name: name };
    const res = await fetch(`${base}/hook/opencode`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(positive("HOOK_PLUGIN_TIMEOUT_MS", DEFAULT_TIMEOUT_MS)),
    });
    if (res.status !== 200) return null;
    const answer: unknown = await res.json();
    return typeof answer === "object" && answer !== null && !Array.isArray(answer) ? (answer as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Consecutive continues per session, for the cap. */
const continues = new Map<string, number>();

/** The subset of the plugin context this file uses. */
interface Ctx {
  tool: { hook(name: string, fn: (input: unknown) => Promise<void>): unknown };
  permission: { hook(name: string, fn: (input: unknown) => Promise<void>): unknown };
  session: {
    hook(name: string, fn: (input: unknown) => Promise<void>): unknown;
    synthetic?(input: { sessionID: string; text: string }): Promise<unknown>;
  };
  event: { subscribe(filter: undefined, options: Record<string, never>): Promise<AsyncIterable<{ type?: unknown; data?: unknown }>> };
}

/** Acts on a continue answer to an idle hook, within the per-session cap. Never throws. */
async function keepGoing(ctx: Ctx, input: unknown, answer: Answer): Promise<void> {
  const sessionID = (input as { sessionID?: unknown } | null)?.sessionID;
  if (typeof sessionID !== "string") return;
  const text = answer?.continue;
  if (typeof text !== "string" || text === "") {
    continues.delete(sessionID);
    return;
  }
  const n = continues.get(sessionID) ?? 0;
  if (n >= positive("HOOK_PLUGIN_MAX_CONTINUES", DEFAULT_MAX_CONTINUES) || typeof ctx.session.synthetic !== "function") return;
  continues.set(sessionID, n + 1);
  try {
    await ctx.session.synthetic({ sessionID, text });
  } catch {
    /* a failed continuation lets the session stop, as if no continue had been asked */
  }
}

export default {
  id: "harness-hooks",
  async setup(ctx: Ctx): Promise<void> {
    for (const [area, name] of HOOKS) {
      const hook = `${area}.${name}`;
      try {
        ctx[area].hook(name, async (input: unknown) => {
          const answer = await send(hook, input);
          if (hook === "tool.execute.before") {
            // The one place the plugin throws into OpenCode: a refusal.
            if (answer && typeof answer.deny === "string") throw new Error(answer.deny);
            if (!answer && process.env.HOOK_PLUGIN_FAIL === "closed") throw new Error(process.env.HOOK_PLUGIN_DENY_REASON || DEFAULT_DENY_REASON);
          } else if (hook === "session.experimental.idle") {
            await keepGoing(ctx, input, answer);
          }
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
