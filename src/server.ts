import { timingSafeEqual } from "node:crypto";
import { handle, type HookPayload } from "./handlers.ts";
import { logEvent } from "./log.ts";

export interface ServerConfig {
  port: number;
  /** Bearer token. Empty string disables auth (local dev only). */
  token: string;
  logFile: string;
  logFullPayload: boolean;
}

export function configFromEnv(env: Record<string, string | undefined>): ServerConfig {
  return {
    port: Number(env.PORT ?? 8787),
    token: env.HOOK_TOKEN ?? "",
    logFile: env.HOOK_LOG_FILE ?? "./data/events.jsonl",
    logFullPayload: env.HOOK_LOG_PAYLOAD === "1",
  };
}

function authorized(req: Request, token: string): boolean {
  if (token === "") return true;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${token}`);
  return given.length === want.length && timingSafeEqual(given, want);
}

export function createServer(cfg: ServerConfig) {
  return Bun.serve({
    port: cfg.port,
    async fetch(req) {
      const { pathname } = new URL(req.url);
      if (pathname === "/healthz") return new Response("ok");
      if (pathname !== "/hook") return new Response("not found", { status: 404 });
      if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
      if (!authorized(req, cfg.token)) return new Response("unauthorized", { status: 401 });

      let payload: HookPayload;
      try {
        const body: unknown = await req.json();
        if (typeof body !== "object" || body === null || Array.isArray(body)) {
          return new Response("expected a JSON object", { status: 400 });
        }
        payload = body as HookPayload;
      } catch {
        return new Response("invalid JSON", { status: 400 });
      }

      void logEvent(cfg.logFile, payload, cfg.logFullPayload, new Date().toISOString());
      return Response.json(handle(payload));
    },
  });
}

if (import.meta.main) {
  const cfg = configFromEnv(process.env);
  if (cfg.token === "") console.warn("HOOK_TOKEN is empty: auth disabled (dev only)");
  const server = createServer(cfg);
  console.log(`harness-hooks listening on :${server.port}`);
}
