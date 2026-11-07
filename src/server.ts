import { timingSafeEqual } from "node:crypto";
import { handle, type HookPayload } from "./handlers.ts";
import { flushLog, logEvent } from "./log.ts";

export interface ServerConfig {
  port: number;
  /** Interface to bind. Defaults to loopback; anything else needs a token. */
  host: string;
  /** Bearer token. Empty string disables auth (loopback only). */
  token: string;
  logFile: string;
  logFullPayload: boolean;
  /** The log rotates to <file>.1 before a write would pass this size. */
  logMaxBytes: number;
}

/** Thrown for a bad environment; the message is safe to print (it never contains the token). */
export class ConfigError extends Error {}

const DEFAULT_PORT = 8787;
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_LOG_MAX_BYTES = 100 * 1024 * 1024;

/** A whole number written in plain digits, so "", " 80", "0x10", "1.5" and "-1" are all refused. */
function wholeNumber(name: string, raw: string | undefined, fallback: number, max: number): number {
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(raw) || Number(raw) > max) throw new ConfigError(`${name} must be a whole number from 0 to ${max}`);
  return Number(raw);
}

function isLoopback(host: string): boolean {
  return host === "localhost" || host === "::1" || /^127(\.\d{1,3}){3}$/.test(host);
}

export function configFromEnv(env: Record<string, string | undefined>): ServerConfig {
  const cfg: ServerConfig = {
    port: wholeNumber("PORT", env.PORT, DEFAULT_PORT, 65535),
    host: env.HOOK_HOST ?? DEFAULT_HOST,
    token: env.HOOK_TOKEN ?? "",
    logFile: env.HOOK_LOG_FILE ?? "./data/events.jsonl",
    logFullPayload: env.HOOK_LOG_PAYLOAD === "1",
    logMaxBytes: wholeNumber("HOOK_LOG_MAX_BYTES", env.HOOK_LOG_MAX_BYTES, DEFAULT_LOG_MAX_BYTES, Number.MAX_SAFE_INTEGER),
  };
  if (cfg.host === "") throw new ConfigError("HOOK_HOST must not be empty");
  if (cfg.logMaxBytes === 0) throw new ConfigError("HOOK_LOG_MAX_BYTES must be at least 1");
  if (cfg.token === "" && !isLoopback(cfg.host)) {
    throw new ConfigError(`HOOK_TOKEN is empty, so the server only starts on a loopback address, not on ${cfg.host}`);
  }
  return cfg;
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
    hostname: cfg.host,
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

      void logEvent(cfg.logFile, payload, cfg.logFullPayload, new Date().toISOString(), cfg.logMaxBytes);
      return Response.json(handle(payload));
    },
  });
}

if (import.meta.main) {
  let cfg: ServerConfig;
  try {
    cfg = configFromEnv(process.env);
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    console.error(`harness-hooks: ${err.message}`);
    process.exit(2);
  }
  if (cfg.token === "") console.warn("HOOK_TOKEN is empty: auth disabled (loopback only)");
  const server = createServer(cfg);
  console.log(`harness-hooks listening on ${server.hostname}:${server.port}`);

  // Stop taking connections, let queued log lines reach the disk, then leave with 0.
  // A second signal, or a stop that takes over 5 seconds, leaves at once.
  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) process.exit(1);
    stopping = true;
    console.log(`harness-hooks: ${signal}, shutting down`);
    const giveUp = setTimeout(() => process.exit(1), 5000);
    void server.stop().then(flushLog).then(() => {
      clearTimeout(giveUp);
      process.exit(0);
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
