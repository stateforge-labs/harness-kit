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
  /** Requests with a bigger body are refused with 413. */
  maxBodyBytes: number;
  /** How long a shutdown waits for requests in flight before it closes them. */
  shutdownGraceMs: number;
}

/** Thrown for a bad environment; the message is safe to print (it never contains the token). */
export class ConfigError extends Error {}

const DEFAULT_PORT = 8787;
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_LOG_MAX_BYTES = 100 * 1024 * 1024;
const DEFAULT_MAX_BODY_BYTES = 32 * 1024 * 1024;
const DEFAULT_SHUTDOWN_GRACE_MS = 5000;

/** A whole number written in plain digits, so "", " 80", "0x10", "1.5" and "-1" are all refused. */
function wholeNumber(name: string, raw: string | undefined, fallback: number, max: number): number {
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(raw) || Number(raw) > max) throw new ConfigError(`${name} must be a whole number from 0 to ${max}`);
  return Number(raw);
}

function isLoopback(host: string): boolean {
  if (host === "localhost" || host === "::1") return true;
  const m = /^127((?:\.\d{1,3}){3})$/.exec(host);
  return m !== null && m[1]!.slice(1).split(".").every((o) => Number(o) <= 255);
}

export function configFromEnv(env: Record<string, string | undefined>): ServerConfig {
  const cfg: ServerConfig = {
    port: wholeNumber("PORT", env.PORT, DEFAULT_PORT, 65535),
    host: env.HOOK_HOST ?? DEFAULT_HOST,
    token: env.HOOK_TOKEN ?? "",
    logFile: env.HOOK_LOG_FILE ?? "./data/events.jsonl",
    logFullPayload: env.HOOK_LOG_PAYLOAD === "1",
    logMaxBytes: wholeNumber("HOOK_LOG_MAX_BYTES", env.HOOK_LOG_MAX_BYTES, DEFAULT_LOG_MAX_BYTES, Number.MAX_SAFE_INTEGER),
    maxBodyBytes: wholeNumber("HOOK_MAX_BODY_BYTES", env.HOOK_MAX_BODY_BYTES, DEFAULT_MAX_BODY_BYTES, Number.MAX_SAFE_INTEGER),
    shutdownGraceMs: wholeNumber("HOOK_SHUTDOWN_GRACE_MS", env.HOOK_SHUTDOWN_GRACE_MS, DEFAULT_SHUTDOWN_GRACE_MS, 600_000),
  };
  if (cfg.host === "") throw new ConfigError("HOOK_HOST must not be empty");
  if (cfg.logMaxBytes === 0) throw new ConfigError("HOOK_LOG_MAX_BYTES must be at least 1");
  if (cfg.maxBodyBytes === 0) throw new ConfigError("HOOK_MAX_BODY_BYTES must be at least 1");
  if (cfg.token === "" && !isLoopback(cfg.host)) {
    throw new ConfigError(`HOOK_TOKEN is empty, so the server only starts on a loopback address, not on ${cfg.host}`);
  }
  return cfg;
}

/** The Host values a loopback server answers to when it has no token (see admit). */
const LOOPBACK_HOST = /^(localhost|127(\.\d{1,3}){3}|\[::1\])(:\d+)?$/i;

/**
 * Who may post. With a token, only a request that carries it: a web page cannot add an Authorization header
 * without a preflight, so no further check is needed. With no token the server is open on loopback, which a web
 * page in the user's browser can also reach, so it also requires a loopback Host (stops DNS rebinding) and a
 * JSON content type (a cross-site form or no-cors fetch cannot send one). Returns the refusal, or null to admit.
 */
function admit(req: Request, token: string): Response | null {
  if (token !== "") return authorized(req, token) ? null : new Response("unauthorized", { status: 401 });
  const host = req.headers.get("host");
  if (host !== null && !LOOPBACK_HOST.test(host)) return new Response("forbidden host", { status: 403 });
  if (!/^application\/json\b/i.test(req.headers.get("content-type") ?? "")) {
    return new Response("expected content-type application/json", { status: 415 });
  }
  return null;
}

function authorized(req: Request, token: string): boolean {
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${token}`);
  return given.length === want.length && timingSafeEqual(given, want);
}

export function createServer(cfg: ServerConfig) {
  return Bun.serve({
    port: cfg.port,
    hostname: cfg.host,
    maxRequestBodySize: cfg.maxBodyBytes,
    async fetch(req) {
      const { pathname } = new URL(req.url);
      if (pathname === "/healthz") return new Response("ok");
      if (pathname !== "/hook") return new Response("not found", { status: 404 });
      if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
      const refused = admit(req, cfg.token);
      if (refused) return refused;

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
  // Requests still open after the grace period are closed and the exit code is 1; the log is flushed either way.
  // A second signal leaves at once.
  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) process.exit(1);
    stopping = true;
    console.log(`harness-hooks: ${signal}, shutting down`);
    let finished = false;
    const finish = (code: number) => {
      if (finished) return;
      finished = true;
      void flushLog().then(() => process.exit(code));
    };
    const giveUp = setTimeout(() => {
      void server.stop(true);
      finish(1);
    }, cfg.shutdownGraceMs);
    void server.stop().then(() => {
      clearTimeout(giveUp);
      finish(0);
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
