// Throwaway capture server for resolving research unknowns. Not the product server.
// Logs every POST body (full payload) as JSONL and replies with CAPTURE_RESPONSE (JSON, default {}).
// Usage: CAPTURE_LOG=<file> CAPTURE_TOKEN=<t> [CAPTURE_RESPONSE='{...}'] bun tools/capture-server.ts
// Every reply sent is also appended to replies.jsonl in the same folder as CAPTURE_LOG ({ts, reply}).
import { appendFileSync } from "node:fs";

const log = process.env.CAPTURE_LOG!;
const replyLog = log.replace(/[^/]*$/, "replies.jsonl");
const token = process.env.CAPTURE_TOKEN!;
const reply = JSON.parse(process.env.CAPTURE_RESPONSE ?? "{}");
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(req) {
    if (req.headers.get("authorization") !== `Bearer ${token}`) return new Response("unauthorized", { status: 401 });
    const body = await req.json().catch(() => null);
    appendFileSync(log, JSON.stringify({ ts: new Date().toISOString(), payload: body }) + "\n");
    appendFileSync(replyLog, JSON.stringify({ ts: new Date().toISOString(), reply }) + "\n");
    return Response.json(reply);
  },
});
console.log(`capture listening on :${server.port}`);
