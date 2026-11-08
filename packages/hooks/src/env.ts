import { homedir } from "node:os";
import { join } from "node:path";

export type EnvSource = Readonly<Record<string, string | undefined>>;

export const EnvVar = {
  HookUrl: "HOOK_URL",
  HookToken: "HOOK_TOKEN",
  ShimTimeoutMs: "HOOK_SHIM_TIMEOUT_MS",
  ShimDebug: "HOOK_SHIM_DEBUG",
  ShimFail: "HOOK_SHIM_FAIL",
  ShimDenyReason: "HOOK_SHIM_DENY_REASON",
  PluginTimeoutMs: "HOOK_PLUGIN_TIMEOUT_MS",
  PluginFail: "HOOK_PLUGIN_FAIL",
  PluginDenyReason: "HOOK_PLUGIN_DENY_REASON",
  PluginMaxContinues: "HOOK_PLUGIN_MAX_CONTINUES",
  Port: "PORT",
  HookHost: "HOOK_HOST",
  HookLogFile: "HOOK_LOG_FILE",
  HookLogPayload: "HOOK_LOG_PAYLOAD",
  HookLogMaxBytes: "HOOK_LOG_MAX_BYTES",
  HookMaxBodyBytes: "HOOK_MAX_BODY_BYTES",
  HookShutdownGraceMs: "HOOK_SHUTDOWN_GRACE_MS",
  HookMiddleware: "HOOK_MIDDLEWARE",
  HookMiddlewareTimeoutMs: "HOOK_MIDDLEWARE_TIMEOUT_MS",
  XdgConfigHome: "XDG_CONFIG_HOME",
  XdgStateHome: "XDG_STATE_HOME",
  CodexHome: "CODEX_HOME",
  Home: "HOME",
  Path: "PATH",
  CaptureLog: "CAPTURE_LOG",
  CaptureToken: "CAPTURE_TOKEN",
  CaptureResponse: "CAPTURE_RESPONSE",
  CaptureRules: "CAPTURE_RULES",
} as const;

export type EnvVarName = (typeof EnvVar)[keyof typeof EnvVar];

export const FailMode = { Open: "open", Closed: "closed" } as const;

const ENABLED = "1";

export const EnvDefault = {
  HookUrl: "http://127.0.0.1:8787",
  ClientTimeoutMs: 5000,
  DenyReason: "harness-hooks: the hook server did not answer, so this call is refused (fail-closed).",
  PluginMaxContinues: 8,
  Port: 8787,
  HookHost: "127.0.0.1",
  HookLogFile: "./data/events.jsonl",
  HookLogMaxBytes: 100 * 1024 * 1024,
  HookMaxBodyBytes: 32 * 1024 * 1024,
  HookShutdownGraceMs: 5000,
  HookMiddlewareTimeoutMs: 2000,
  CaptureResponse: "{}",
  CaptureRules: "[]",
} as const;

export const processEnv = (): EnvSource => process.env;

export function setEnv(values: Partial<Record<EnvVarName, string | undefined>>): () => void {
  const saved = Object.fromEntries(Object.keys(values).map((k) => [k, process.env[k]]));
  const apply = (v: Record<string, string | undefined>) => {
    for (const [k, x] of Object.entries(v)) {
      if (x === undefined) delete process.env[k];
      else process.env[k] = x;
    }
  };
  apply(values);
  return () => apply(saved);
}

const positive = (v: string | undefined, fallback: number): number => (v && /^\d+$/.test(v) && Number(v) > 0 ? Number(v) : fallback);
const baseUrl = (v: string | undefined): string => (v ?? EnvDefault.HookUrl).replace(/\/+$/, "");

export interface ClientEnv {
  url: string;
  token: string;
  timeoutMs: number;
  failClosed: boolean;
  denyReason: string;
}

export interface ShimEnv extends ClientEnv {
  debug: boolean;
}

export interface PluginEnv extends ClientEnv {
  maxContinues: number;
}

export function shimEnv(source: EnvSource = processEnv()): ShimEnv {
  return {
    url: baseUrl(source[EnvVar.HookUrl]),
    token: source[EnvVar.HookToken] ?? "",
    timeoutMs: positive(source[EnvVar.ShimTimeoutMs], EnvDefault.ClientTimeoutMs),
    failClosed: source[EnvVar.ShimFail] === FailMode.Closed,
    denyReason: source[EnvVar.ShimDenyReason] || EnvDefault.DenyReason,
    debug: source[EnvVar.ShimDebug] === ENABLED,
  };
}

export function pluginEnv(source: EnvSource = processEnv()): PluginEnv {
  return {
    url: baseUrl(source[EnvVar.HookUrl]),
    token: source[EnvVar.HookToken] ?? "",
    timeoutMs: positive(source[EnvVar.PluginTimeoutMs], EnvDefault.ClientTimeoutMs),
    failClosed: source[EnvVar.PluginFail] === FailMode.Closed,
    denyReason: source[EnvVar.PluginDenyReason] || EnvDefault.DenyReason,
    maxContinues: positive(source[EnvVar.PluginMaxContinues], EnvDefault.PluginMaxContinues),
  };
}

export interface InstallEnv {
  configHome: string;
  stateHome: string;
  codexHome: string;
}

export function installEnv(source: EnvSource = processEnv()): InstallEnv {
  return {
    configHome: source[EnvVar.XdgConfigHome] ?? join(homedir(), ".config"),
    stateHome: source[EnvVar.XdgStateHome] ?? join(homedir(), ".local", "state"),
    codexHome: source[EnvVar.CodexHome] ?? join(homedir(), ".codex"),
  };
}

export interface CaptureEnv {
  log: string;
  token: string;
  response: string;
  rules: string;
}

export function captureEnv(source: EnvSource = processEnv()): CaptureEnv {
  const log = source[EnvVar.CaptureLog];
  const token = source[EnvVar.CaptureToken];
  if (!log || !token) throw new Error(`${EnvVar.CaptureLog} and ${EnvVar.CaptureToken} are required`);
  return { log, token, response: source[EnvVar.CaptureResponse] ?? EnvDefault.CaptureResponse, rules: source[EnvVar.CaptureRules] ?? EnvDefault.CaptureRules };
}

export const isEnabled = (v: string | undefined): boolean => v === ENABLED;
