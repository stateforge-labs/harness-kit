// Command-hook shim: reads one hook payload on stdin, POSTs it to the harness-hooks server, prints the answer.
//   bun hook-shim.ts --harness codex      (it uses no Bun API: Node 22.18+ runs this file from a checkout; an installed copy
//   runs dist/clients/shim/hook-shim.js, because Node does not strip types under node_modules. `shimPath` picks the right one.)
// For harnesses whose hooks are commands (Codex, and Claude Code's SessionStart and Setup, which cannot be http).
//
// Environment: HOOK_URL (default http://127.0.0.1:8787), HOOK_TOKEN (sent as a bearer token, never printed),
// HOOK_SHIM_TIMEOUT_MS (default 5000), HOOK_SHIM_DEBUG=1 (say on stderr why it failed; never the token),
// HOOK_SHIM_FAIL=open|closed (default open), HOOK_SHIM_DENY_REASON (the refusal text in closed mode).
//
// By default it fails OPEN: if the server is down, slow, refuses the post or answers anything but a JSON object, it prints `{}`
// and exits 0, so a broken server never blocks the agent. `{}` and not nothing, because Codex needs a JSON object on
// stdout for some events (Stop, SubagentStop, Interrupt). It never exits 2, which Codex reads as "block".
// With HOOK_SHIM_FAIL=closed the same failures refuse instead, on the two events where a refusal means something:
// PreToolUse gets a `permissionDecision: "deny"` and PermissionRequest a `decision.behavior: "deny"` (Claude Code and Codex share
// these shapes; see encodeHookOutput in src/adapters/shared.ts). Every other event still gets `{}`: a refusal on Stop would read
// as "keep going". The harness's own hook timeout must be longer than HOOK_SHIM_TIMEOUT_MS, or the harness gives up first and,
// on Codex, lets the call through (R-2026-11-07-10 F7).
// A call that is wrong in itself (no --harness) exits 1, a visible error that does not block.

const DEFAULT_URL = "http://127.0.0.1:8787";
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_DENY_REASON = "harness-hooks: the hook server did not answer, so this call is refused (fail-closed).";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const harness = arg("--harness");
if (!harness || !/^[a-z0-9-]+$/.test(harness)) {
  console.error("usage: hook-shim.ts --harness <claude|codex|opencode>");
  process.exit(1);
}

const debug = process.env.HOOK_SHIM_DEBUG === "1";

const timeoutEnv = process.env.HOOK_SHIM_TIMEOUT_MS;
const timeoutMs = timeoutEnv && /^\d+$/.test(timeoutEnv) && Number(timeoutEnv) > 0 ? Number(timeoutEnv) : DEFAULT_TIMEOUT_MS;
const base = (process.env.HOOK_URL ?? DEFAULT_URL).replace(/\/+$/, "");
const token = process.env.HOOK_TOKEN ?? "";
const failClosed = process.env.HOOK_SHIM_FAIL === "closed";
const denyReason = process.env.HOOK_SHIM_DENY_REASON || DEFAULT_DENY_REASON;

/** The reason a call failed (open or closed). Its text never contains a header, so it cannot carry the token. */
class FailOpen extends Error {}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function ask(body: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${base}/hook/${harness}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new FailOpen(err instanceof Error && err.name === "TimeoutError" ? "timeout" : "server unreachable");
  }
  if (res.status !== 200) throw new FailOpen(`server answered ${res.status}`);
  const text = (await res.text()).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new FailOpen("server answer is not JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new FailOpen("server answer is not a JSON object");
  return text;
}

/** The answer when the server failed: `{}`, or in closed mode a refusal on PreToolUse and PermissionRequest. */
function fallback(body: string): string {
  if (!failClosed) return "{}";
  let name: unknown;
  try {
    name = (JSON.parse(body) as { hook_event_name?: unknown }).hook_event_name;
  } catch {
    return "{}";
  }
  if (name === "PreToolUse") {
    return JSON.stringify({ hookSpecificOutput: { hookEventName: name, permissionDecision: "deny", permissionDecisionReason: denyReason } });
  }
  if (name === "PermissionRequest") {
    return JSON.stringify({ hookSpecificOutput: { hookEventName: name, decision: { behavior: "deny", message: denyReason } } });
  }
  return "{}";
}

let body = "";
let out: string;
try {
  body = await readStdin();
  out = await ask(body);
} catch (err) {
  out = fallback(body);
  if (debug) console.error(`hook-shim: failing ${failClosed ? "closed" : "open"} (${err instanceof FailOpen ? err.message : "unexpected error"})`);
}
// Wait for the write to finish: exiting straight after a write to a pipe can cut the answer short.
await new Promise<void>((done) => process.stdout.write(`${out}\n`, () => done()));
process.exit(0);
