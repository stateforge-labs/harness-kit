import { appendFile, mkdir, rename, stat } from "node:fs/promises";
import { dirname } from "node:path";
import type { Handled } from "./app.ts";

/** Every write goes through this chain, so appends never overlap and a rotation never races an append. */
let queue: Promise<void> = Promise.resolve();

/** Resolves once every log line queued so far has been written. */
export function flushLog(): Promise<void> {
  return queue;
}

/** The longest string the metadata log keeps from a request; longer values are cut so one request cannot make a huge line. */
const MAX_FIELD_CHARS = 256;
const MAX_KEYS = 100;

/** A common field is logged only when it is a string: an object or array there (a damaged or hostile payload) would otherwise be written whole. */
const label = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

function clip(v: unknown): unknown {
  if (typeof v === "string") return v.length > MAX_FIELD_CHARS ? `${v.slice(0, MAX_FIELD_CHARS)}...[${v.length} chars]` : v;
  if (Array.isArray(v)) return v.slice(0, MAX_KEYS).map(clip);
  return v;
}

/**
 * One JSONL line per event. By default only metadata (no prompts, no
 * tool_input), enough to count events per session/agent. HOOK_LOG_PAYLOAD=1
 * stores the full body so real payload shapes can be studied before building a
 * call review. Failures never reach the hook response.
 *
 * The line is built here, before it is queued, so the queue holds small strings and not request bodies.
 */
export function logEvent(
  file: string,
  payload: Record<string, unknown>,
  handled: Handled,
  full: boolean,
  ts: string,
  maxBytes: number,
): Promise<void> {
  let text: string;
  try {
    text = JSON.stringify(lineFor(payload, handled, full, ts)) + "\n";
  } catch (err) {
    console.error("log line failed:", err);
    return queue;
  }
  // One failed write must not break the chain for the writes behind it.
  const next = queue.then(() => write(file, text, maxBytes)).catch((err) => console.error("log write failed:", err));
  queue = next;
  return next;
}

function lineFor(payload: Record<string, unknown>, handled: Handled, full: boolean, ts: string): Record<string, unknown> {
  const { decoded, common } = handled;
  if (full) return { ts, harness: handled.harness, payload, known: decoded.known, missing: decoded.missing, wrong_type: decoded.wrong_type };
  const line: Record<string, unknown> = {
    ts,
    harness: handled.harness,
    event: label(common.event),
    session_id: label(common.session_id),
    agent_id: label(common.agent_id),
    agent_type: label(common.agent_type),
    tool_name: label(common.tool_name),
    keys: Object.keys(payload).sort(),
    known: decoded.known,
    missing: decoded.missing,
    wrong_type: decoded.wrong_type,
    ...decoded.meta,
  };
  return Object.fromEntries(Object.entries(line).map(([k, v]) => [k, clip(v)]));
}

async function sizeOf(file: string): Promise<number> {
  try {
    return (await stat(file)).size;
  } catch {
    return 0;
  }
}

/** The log can hold prompts (HOOK_LOG_PAYLOAD=1), so what this process creates is readable by its owner only. */
async function write(file: string, text: string, maxBytes: number): Promise<void> {
  try {
    await mkdir(dirname(file), { recursive: true, mode: 0o700 });
    // Keep one old generation: the file stays under maxBytes (except one line that is bigger on its own),
    // so disk use stays near twice the cap.
    const size = await sizeOf(file);
    if (size > 0 && size + Buffer.byteLength(text) > maxBytes) {
      try {
        await rename(file, `${file}.1`);
      } catch (err) {
        // A broken rotation must not stop the log: keep appending and say so.
        console.error("log rotation failed, appending past the cap:", err);
      }
    }
    await appendFile(file, text, { mode: 0o600 });
  } catch (err) {
    console.error("log write failed:", err);
  }
}
