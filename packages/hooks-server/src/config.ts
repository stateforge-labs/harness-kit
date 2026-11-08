import { isAbsolute } from "node:path";
import { EnvDefault, EnvVar, isEnabled, processEnv, type EnvSource } from "@homelab/harness-hooks";
import { z } from "zod";
import { isLoopbackHost } from "./net.ts";

export class ConfigError extends Error {}

const digits = (name: string, min: number, max: number) => {
  const message = `${name} must be a whole number from ${min} to ${max}`;
  return z.string().regex(/^\d+$/, message).transform(Number).pipe(z.number().min(min, message).max(max, message));
};

const EnvSchema = z.object({
  [EnvVar.Port]: digits(EnvVar.Port, 0, 65535).default(EnvDefault.Port),
  [EnvVar.HookHost]: z.string().min(1, `${EnvVar.HookHost} must not be empty`).default(EnvDefault.HookHost),
  [EnvVar.HookToken]: z.string().default(""),
  [EnvVar.HookLogFile]: z.string().default(EnvDefault.HookLogFile),
  [EnvVar.HookLogPayload]: z.string().default("").transform(isEnabled),
  [EnvVar.HookLogMaxBytes]: digits(EnvVar.HookLogMaxBytes, 1, Number.MAX_SAFE_INTEGER).default(EnvDefault.HookLogMaxBytes),
  [EnvVar.HookMaxBodyBytes]: digits(EnvVar.HookMaxBodyBytes, 1, Number.MAX_SAFE_INTEGER).default(EnvDefault.HookMaxBodyBytes),
  [EnvVar.HookShutdownGraceMs]: digits(EnvVar.HookShutdownGraceMs, 0, 600_000).default(EnvDefault.HookShutdownGraceMs),
  [EnvVar.HookMiddleware]: z
    .string()
    .default("")
    .transform((v) => v.split(",").map((p) => p.trim()).filter((p) => p !== ""))
    .refine((paths) => paths.every((p) => isAbsolute(p)), `${EnvVar.HookMiddleware} must be a comma-separated list of absolute file paths`),
  [EnvVar.HookMiddlewareTimeoutMs]: digits(EnvVar.HookMiddlewareTimeoutMs, 1, 60_000).default(EnvDefault.HookMiddlewareTimeoutMs),
});

export class ServerConfig {
  readonly port: number;
  readonly host: string;
  readonly token: string;
  readonly logFile: string;
  readonly logFullPayload: boolean;
  readonly logMaxBytes: number;
  readonly maxBodyBytes: number;
  readonly shutdownGraceMs: number;
  readonly middleware: readonly string[];
  readonly middlewareTimeoutMs: number;

  constructor(env: EnvSource = processEnv()) {
    const parsed = EnvSchema.safeParse(env);
    if (!parsed.success) throw new ConfigError(parsed.error.issues.map((i) => i.message).join("; "));
    const e = parsed.data;
    this.port = e[EnvVar.Port];
    this.host = e[EnvVar.HookHost];
    this.token = e[EnvVar.HookToken];
    this.logFile = e[EnvVar.HookLogFile];
    this.logFullPayload = e[EnvVar.HookLogPayload];
    this.logMaxBytes = e[EnvVar.HookLogMaxBytes];
    this.maxBodyBytes = e[EnvVar.HookMaxBodyBytes];
    this.shutdownGraceMs = e[EnvVar.HookShutdownGraceMs];
    this.middleware = e[EnvVar.HookMiddleware];
    this.middlewareTimeoutMs = e[EnvVar.HookMiddlewareTimeoutMs];
    if (this.token === "" && !isLoopbackHost(this.host)) {
      throw new ConfigError(`${EnvVar.HookToken} is empty, so the server only starts on a loopback address, not on ${this.host}`);
    }
  }
}
