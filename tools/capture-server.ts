// Throwaway capture server for resolving research unknowns. Not the product server.
// Logs every POST body (full payload) as JSONL and replies with JSON.
// Usage: CAPTURE_LOG=<file> CAPTURE_TOKEN=<t> [CAPTURE_RESPONSE='{...}'] [CAPTURE_RULES='[...]'] bun tools/capture-server.ts
//
// CAPTURE_RESPONSE is the default reply (default {}). CAPTURE_RULES picks a different reply per request, first match wins:
//   [{ "event": "PreToolUse", "tool": "mcp__probe__echo", "reply": {...}, "times": 1, "delayMs": 0 }, ...]
// `event` matches the body's hook_event_name, `tool` (optional) its tool_name, or for OpenCode the body's `tool`. A rule with
// `times` stops matching after that many uses. `delayMs` waits before answering (to probe a harness's hook timeout).
// Every reply sent is also appended to replies.jsonl in the same folder as CAPTURE_LOG ({ts, event, tool, rule, reply}).
import { appendFileSync } from "node:fs";

interface Rule {
  event: string;
  tool?: string;
  reply: unknown;
  times?: number;
  delayMs?: number;
}

const log = process.env.CAPTURE_LOG!;
const replyLog = log.replace(/[^/]*$/, "replies.jsonl");
const token = process.env.CAPTURE_TOKEN!;
const fallback: unknown = JSON.parse(process.env.CAPTURE_RESPONSE ?? "{}");
const rules: Rule[] = JSON.parse(process.env.CAPTURE_RULES ?? "[]");
const used = new Map<number, number>();

function pick(body: Record<string, unknown> | null): { index: number; rule?: Rule } {
  const event = body?.hook_event_name;
  const tool = body?.tool_name ?? body?.tool;
  const index = rules.findIndex(
    (r, i) => r.event === event && (r.tool === undefined || r.tool === tool) && (r.times === undefined || (used.get(i) ?? 0) < r.times),
  );
  if (index >= 0) used.set(index, (used.get(index) ?? 0) + 1);
  return { index, rule: rules[index] };
}

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  idleTimeout: 255,
  async fetch(req) {
    if (req.headers.get("authorization") !== `Bearer ${token}`) return new Response("unauthorized", { status: 401 });
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const ts = new Date().toISOString();
    appendFileSync(log, JSON.stringify({ ts, payload: body }) + "\n");
    const { index, rule } = pick(body);
    if (rule?.delayMs) await Bun.sleep(rule.delayMs);
    const reply = rule ? rule.reply : fallback;
    appendFileSync(
      replyLog,
      JSON.stringify({ ts, event: body?.hook_event_name ?? null, tool: body?.tool_name ?? body?.tool ?? null, rule: index >= 0 ? index : null, reply }) + "\n",
    );
    return Response.json(reply);
  },
});
console.log(`capture listening on :${server.port}`);
