import { isAbsolute } from "node:path";
import { z } from "zod";
import { isLoopbackHost } from "./net.ts";

/** Thrown for a bad environment; the message is safe to print (it never contains the token). */
export class ConfigError extends Error {}

/** A whole number written in plain digits ("", " 80", "0x10", "1.5" and "-1" are refused) inside [min, max]. */
const digits = (name: string, min: number, max: number) => {
  const message = `${name} must be a whole number from ${min} to ${max}`;
  return z.string().regex(/^\d+$/, message).transform(Number).pipe(z.number().min(min, message).max(max, message));
};

/** The environment the server reads. Anything not listed here is ignored. */
const EnvSchema = z.object({
  PORT: digits("PORT", 0, 65535).default(8787),
  HOOK_HOST: z.string().min(1, "HOOK_HOST must not be empty").default("127.0.0.1"),
  HOOK_TOKEN: z.string().default(""),
  HOOK_LOG_FILE: z.string().default("./data/events.jsonl"),
  HOOK_LOG_PAYLOAD: z.string().default("").transform((v) => v === "1"),
  HOOK_LOG_MAX_BYTES: digits("HOOK_LOG_MAX_BYTES", 1, Number.MAX_SAFE_INTEGER).default(100 * 1024 * 1024),
  HOOK_MAX_BODY_BYTES: digits("HOOK_MAX_BODY_BYTES", 1, Number.MAX_SAFE_INTEGER).default(32 * 1024 * 1024),
  HOOK_SHUTDOWN_GRACE_MS: digits("HOOK_SHUTDOWN_GRACE_MS", 0, 600_000).default(5000),
  HOOK_MIDDLEWARE: z
    .string()
    .default("")
    .transform((v) => v.split(",").map((p) => p.trim()).filter((p) => p !== ""))
    .refine((paths) => paths.every((p) => isAbsolute(p)), "HOOK_MIDDLEWARE must be a comma-separated list of absolute file paths"),
  HOOK_MIDDLEWARE_TIMEOUT_MS: digits("HOOK_MIDDLEWARE_TIMEOUT_MS", 1, 60_000).default(2000),
});

/**
 * The server's settings. The constructor reads and validates the whole environment and throws a ConfigError for the first
 * problem, so a ServerConfig that exists is a valid one.
 */
export class ServerConfig {
  readonly port: number;
  /** Interface to bind. Defaults to loopback; anything else needs a token. */
  readonly host: string;
  /** Bearer token. Empty string disables auth (loopback only). */
  readonly token: string;
  readonly logFile: string;
  readonly logFullPayload: boolean;
  /** The log rotates to <file>.1 before a write would pass this size. */
  readonly logMaxBytes: number;
  /** Requests with a bigger body are refused with 413. */
  readonly maxBodyBytes: number;
  /** How long a shutdown waits for requests in flight before it closes them. */
  readonly shutdownGraceMs: number;
  /** Modules loaded at start, each default-exporting a Middleware (or an array of them), outermost first. */
  readonly middleware: readonly string[];
  /** A middleware that has not answered after this long is skipped. */
  readonly middlewareTimeoutMs: number;

  constructor(env: Record<string, string | undefined> = process.env) {
    const parsed = EnvSchema.safeParse(env);
    if (!parsed.success) throw new ConfigError(parsed.error.issues.map((i) => i.message).join("; "));
    const e = parsed.data;
    this.port = e.PORT;
    this.host = e.HOOK_HOST;
    this.token = e.HOOK_TOKEN;
    this.logFile = e.HOOK_LOG_FILE;
    this.logFullPayload = e.HOOK_LOG_PAYLOAD;
    this.logMaxBytes = e.HOOK_LOG_MAX_BYTES;
    this.maxBodyBytes = e.HOOK_MAX_BODY_BYTES;
    this.shutdownGraceMs = e.HOOK_SHUTDOWN_GRACE_MS;
    this.middleware = e.HOOK_MIDDLEWARE;
    this.middlewareTimeoutMs = e.HOOK_MIDDLEWARE_TIMEOUT_MS;
    if (this.token === "" && !isLoopbackHost(this.host)) {
      throw new ConfigError(`HOOK_TOKEN is empty, so the server only starts on a loopback address, not on ${this.host}`);
    }
  }
}
