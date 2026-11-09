import { encodeHookOutput, type HookOutputRules } from "../../src/adapters/hook-output.ts";
import { adapters } from "../../src/adapters/index.ts";
import { output as claudeOutput } from "../../src/adapters/claude/output.ts";
import { output as codexOutput } from "../../src/adapters/codex/output.ts";
import { Harness } from "../../src/core/event.ts";
import { EnvDefault, EnvVar } from "../../src/env.ts";
import {
  CURL_MIN_VERSION,
  CURL_VERSION_PATTERN,
  CurlTokenSource,
  SHIM_AUTH_HEADER,
  SHIM_CONTENT_TYPE_HEADER,
  SHIM_DEBUG_ON,
  SHIM_EVENT_PATTERN,
  SHIM_FALLBACK_OPEN,
  SHIM_HARNESS_PATTERN,
  SHIM_HOOK_PATH,
  SHIM_LOCAL_HOST,
  SHIM_NEWLINE_VAR,
  SHIM_OK_STATUS,
  SHIM_STATUS_MARKER,
  type CurlTokenSourceName,
} from "./curl-constants.ts";

const OUTPUT_RULES: Readonly<Record<string, HookOutputRules>> = { [Harness.Claude]: claudeOutput, [Harness.Codex]: codexOutput };

/** What a generated shim is built from. Everything except the bearer token is written into the script. */
export interface CurlShimOptions {
  /** The harness id the shim posts to: `/hook/<harness>`. */
  harness: string;
  /** Base URL of the hook server; ignored when `socketPath` is set. Defaults to `EnvDefault.HookUrl`. */
  url?: string;
  /** Unix socket of the hook server; curl connects through it with `--unix-socket`. */
  socketPath?: string;
  /** `--max-time`, in milliseconds. Defaults to `EnvDefault.ClientTimeoutMs`. */
  timeoutMs?: number;
  /** Print the refusal for PreToolUse and PermissionRequest when the server fails, instead of `{}`. */
  failClosed?: boolean;
  /** The refusal text when failing closed. Defaults to `EnvDefault.DenyReason`. */
  denyReason?: string;
  /** Where the token comes from: the `HOOK_TOKEN` variable at call time (default), a header file at `tokenFile`, or none (a server that needs no token). */
  tokenSource?: CurlTokenSourceName;
  /** Path of a curl header file holding `authorization: Bearer <token>`; required for `tokenSource: "file"`. */
  tokenFile?: string;
  /** Hook event names the fail-closed bodies are rendered for. Defaults to every event of the harness. */
  events?: readonly string[];
}

const quote = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`;

const seconds = (ms: number): string => String(ms / 1000);

function eventsOf(harness: string, given: readonly string[] | undefined): readonly string[] {
  if (given) return given;
  const adapter = adapters.get(harness);
  return adapter ? Object.keys(adapter.jsonSchemas()).sort() : [];
}

function closedBodies(harness: string, events: readonly string[], reason: string): [string, string][] {
  const rules = OUTPUT_RULES[harness];
  if (!rules) return [];
  const bodies: [string, string][] = [];
  for (const event of events) {
    if (!SHIM_EVENT_PATTERN.test(event)) throw new TypeError(`renderCurlShim: unsafe event name ${JSON.stringify(event)}`);
    const body = JSON.stringify(encodeHookOutput({ deny: { reason } }, event, rules));
    if (body !== SHIM_FALLBACK_OPEN) bodies.push([event, body]);
  }
  return bodies;
}

function authLines(source: CurlTokenSourceName, tokenFile: string | undefined): string[] {
  const token = EnvVar.HookToken;
  if (source === CurlTokenSource.None) return ["set --"];
  if (source === CurlTokenSource.File) {
    if (!tokenFile) throw new TypeError("renderCurlShim: tokenSource file needs tokenFile");
    return [`if [ -r ${quote(tokenFile)} ]; then set -- --header ${quote(`@${tokenFile}`)}; else set --; fi`];
  }
  return [
    `if [ -n "\${${token}:-}" ]; then`,
    `  set -- --variable ${quote(`%${token}`)} --expand-header ${quote(`${SHIM_AUTH_HEADER} {{${token}}}`)}`,
    "else",
    "  set --",
    "fi",
  ];
}

/**
 * Renders a POSIX sh script that posts the hook payload on stdin to the hook server with curl and prints the answer.
 * The script takes the hook event name as its only argument. It prints `{}` on any failure, or, when `failClosed` is
 * set, the refusal for that event (rendered with `encodeHookOutput`); a Stop event is never refused. The token is
 * handed to curl through its environment or a header file, so it is never in an argument list.
 */
export function renderCurlShim(options: CurlShimOptions): string {
  const { harness } = options;
  if (!SHIM_HARNESS_PATTERN.test(harness)) throw new TypeError(`renderCurlShim: unsafe harness id ${JSON.stringify(harness)}`);
  const timeoutMs = options.timeoutMs ?? EnvDefault.ClientTimeoutMs;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new TypeError("renderCurlShim: timeoutMs must be a positive whole number");
  const base = (options.url ?? EnvDefault.HookUrl).replace(/\/+$/, "");
  const target = `${options.socketPath ? SHIM_LOCAL_HOST : base}${SHIM_HOOK_PATH}/${harness}`;
  const bodies = options.failClosed ? closedBodies(harness, eventsOf(harness, options.events), options.denyReason ?? EnvDefault.DenyReason) : [];
  const debug = `"\${${EnvVar.ShimDebug}:-}" = ${quote(SHIM_DEBUG_ON)}`;
  const nl = `"$${SHIM_NEWLINE_VAR}"`;

  const fallback = [
    "fallback() {",
    `  if [ ${debug} ]; then printf 'hook-shim: failing %s (%s)\\n' ${quote(options.failClosed ? "closed" : "open")} "$1" >&2; fi`,
    ...(bodies.length > 0
      ? [
          '  case "$event" in',
          ...bodies.map(([event, body]) => `    ${quote(event)}) printf '%s\\n' ${quote(body)} ;;`),
          `    *) printf '%s\\n' ${quote(SHIM_FALLBACK_OPEN)} ;;`,
          "  esac",
        ]
      : [`  printf '%s\\n' ${quote(SHIM_FALLBACK_OPEN)}`]),
    "  exit 0",
    "}",
  ];

  const curl = [
    "curl -sS",
    `--max-time ${quote(seconds(timeoutMs))}`,
    ...(options.socketPath ? [`--unix-socket ${quote(options.socketPath)}`] : []),
    "-X POST",
    `-H ${quote(SHIM_CONTENT_TYPE_HEADER)}`,
    '"$@"',
    "--data-binary @-",
    `-w ${quote(SHIM_STATUS_MARKER)}`,
    quote(target),
    "2>&3",
  ].join(" ");

  return [
    "#!/bin/sh",
    "event=${1:-}",
    `${SHIM_NEWLINE_VAR}='`,
    "'",
    `if [ ${debug} ]; then exec 3>&2; else exec 3>/dev/null; fi`,
    ...fallback,
    ...authLines(options.tokenSource ?? CurlTokenSource.Env, options.tokenFile),
    `resp=$(${curl})`,
    "rc=$?",
    `code=\${resp##*${nl}}`,
    `body=\${resp%${nl}*}`,
    'if [ "$rc" -ne 0 ]; then fallback "curl exit $rc"; fi',
    `if [ "$code" != ${quote(String(SHIM_OK_STATUS))} ]; then fallback "server answered $code"; fi`,
    `case "$body" in '{'*'}') ;; *) fallback "empty or non-object answer" ;; esac`,
    `printf '%s\\n' "$body"`,
    "",
  ].join("\n");
}

/** The version in the first line of `curl --version`, or `undefined` when the text is not curl's. */
export function parseCurlVersion(versionOutput: string): string | undefined {
  const m = CURL_VERSION_PATTERN.exec(versionOutput);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : undefined;
}

/** The token mechanism a curl of this version can use, or `undefined` when it is too old (or absent) for the shim. A header file is used when a token is configured and the environment mechanism is out of reach; with no token configured, none is needed. */
export function pickCurlTokenSource(version: string | undefined, tokenConfigured: boolean): CurlTokenSourceName | undefined {
  if (version === undefined) return undefined;
  if (curlSupports(version, CurlTokenSource.Env)) return CurlTokenSource.Env;
  if (!curlSupports(version, CurlTokenSource.File)) return undefined;
  return tokenConfigured ? CurlTokenSource.File : CurlTokenSource.None;
}

/** The content of the header file for `tokenSource: "file"`: one curl header line carrying the bearer token. */
export function renderCurlTokenFile(token: string): string {
  return `${SHIM_AUTH_HEADER} ${token}\n`;
}

/** Whether a dotted version is at least the minimum curl for the token mechanism. */
export function curlSupports(version: string, source: CurlTokenSourceName = CurlTokenSource.Env): boolean {
  const have = version.split(".").map(Number);
  const want = CURL_MIN_VERSION[source].split(".").map(Number);
  for (let i = 0; i < want.length; i++) {
    const a = have[i] ?? 0;
    const b = want[i] ?? 0;
    if (a !== b) return a > b;
  }
  return true;
}
