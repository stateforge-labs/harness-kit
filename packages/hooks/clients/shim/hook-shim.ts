import { encodeHookOutput, type HookOutputRules } from "../../src/adapters/hook-output.ts";
import { output as claudeOutput } from "../../src/adapters/claude/output.ts";
import { output as codexOutput } from "../../src/adapters/codex/output.ts";
import { Harness } from "../../src/core/event.ts";
import { shimEnv } from "../../src/env.ts";

const HARNESS_FLAG = "--harness";
const HARNESS_PATTERN = /^[a-z0-9-]+$/;
const OK = 200;
const EMPTY = "{}";
const USAGE = `usage: hook-shim.ts ${HARNESS_FLAG} <${Object.values(Harness).join("|")}>`;
const OUTPUT_RULES: Readonly<Record<string, HookOutputRules>> = { [Harness.Claude]: claudeOutput, [Harness.Codex]: codexOutput };

class ShimFailure extends Error {}

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks).toString("utf8");
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

async function ask(harness: string, body: string): Promise<string> {
  const env = shimEnv();
  let res: Response;
  try {
    res = await fetch(`${env.url}/hook/${harness}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(env.token ? { authorization: `Bearer ${env.token}` } : {}) },
      body,
      signal: AbortSignal.timeout(env.timeoutMs),
    });
  } catch (err) {
    throw new ShimFailure(err instanceof Error && err.name === "TimeoutError" ? "timeout" : "server unreachable");
  }
  if (res.status !== OK) throw new ShimFailure(`server answered ${res.status}`);
  const text = (await res.text()).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ShimFailure("server answer is not JSON");
  }
  if (!isObject(parsed)) throw new ShimFailure("server answer is not a JSON object");
  return text;
}

function fallback(harness: string, body: string): string {
  const env = shimEnv();
  const rules = OUTPUT_RULES[harness];
  if (!env.failClosed || !rules) return EMPTY;
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return EMPTY;
  }
  const name = isObject(payload) && typeof payload.hook_event_name === "string" ? payload.hook_event_name : undefined;
  return JSON.stringify(encodeHookOutput({ deny: { reason: env.denyReason } }, name, rules));
}

const harness = flag(HARNESS_FLAG);
if (!harness || !HARNESS_PATTERN.test(harness)) {
  console.error(USAGE);
  process.exit(1);
}

let body = "";
let out: string;
try {
  body = await readStdin();
  out = await ask(harness, body);
} catch (err) {
  out = fallback(harness, body);
  const env = shimEnv();
  if (env.debug) console.error(`hook-shim: failing ${env.failClosed ? "closed" : "open"} (${err instanceof ShimFailure ? err.message : "unexpected error"})`);
}
await new Promise<void>((done) => process.stdout.write(`${out}\n`, () => done()));
process.exit(0);
