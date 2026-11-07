// Command-hook shim: reads one hook payload on stdin, POSTs it to the harness-hooks server, prints the answer.
//   bun clients/shim/hook-shim.ts --harness codex
// For harnesses whose hooks are commands (Codex, and Claude Code's SessionStart and Setup, which cannot be http).
//
// Environment: HOOK_URL (default http://127.0.0.1:8787), HOOK_TOKEN (sent as a bearer token, never printed),
// HOOK_SHIM_TIMEOUT_MS (default 2000), HOOK_SHIM_DEBUG=1 (say on stderr why it failed open; never the token).
//
// It fails OPEN: if the server is down, slow, refuses the post or answers anything but a JSON object, it prints `{}`
// and exits 0, so a broken server never blocks the agent. `{}` and not nothing, because Codex needs a JSON object on
// stdout for some events (Stop, SubagentStop, Interrupt). It never exits 2, which Codex reads as "block".
// A call that is wrong in itself (no --harness) exits 1, a visible error that does not block.

const DEFAULT_URL = "http://127.0.0.1:8787";
const DEFAULT_TIMEOUT_MS = 2000;

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

/** The reason a call failed open. Its text never contains a header, so it cannot carry the token. */
class FailOpen extends Error {}

async function ask(): Promise<string> {
  const body = await Bun.stdin.text();
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

let out = "{}";
try {
  out = await ask();
} catch (err) {
  if (debug) console.error(`hook-shim: failing open (${err instanceof FailOpen ? err.message : "unexpected error"})`);
}
// Wait for the write to finish: exiting straight after a write to a pipe can cut the answer short.
await Bun.write(Bun.stdout, `${out}\n`);
process.exit(0);
