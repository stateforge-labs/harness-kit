import { appendFileSync } from "node:fs";
import { captureEnv } from "../packages/hooks/src/env.ts";

interface Rule {
  event: string;
  tool?: string;
  reply: unknown;
  times?: number;
  delayMs?: number;
}

const env = captureEnv();
const log = env.log;
const replyLog = log.replace(/[^/]*$/, "replies.jsonl");
const token = env.token;
const fallback: unknown = JSON.parse(env.response);
const rules: Rule[] = JSON.parse(env.rules);
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
