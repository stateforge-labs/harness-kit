import { appendFile, mkdir, rename, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { describe, type HookPayload } from "./handlers.ts";

/** Every write goes through this chain, so appends never overlap and a rotation never races an append. */
let queue: Promise<void> = Promise.resolve();

/** Resolves once every log line queued so far has been written. */
export function flushLog(): Promise<void> {
  return queue;
}

/**
 * One JSONL line per event. By default only metadata (no prompts, no
 * tool_input), enough to count events per session/agent. HOOK_LOG_PAYLOAD=1
 * stores the full body so real payload shapes can be studied before building a
 * call review. Failures never reach the hook response.
 */
export function logEvent(
  file: string,
  payload: HookPayload,
  full: boolean,
  ts: string,
  maxBytes: number,
): Promise<void> {
  // One failed write must not break the chain for the writes behind it.
  const next = queue.then(() => write(file, payload, full, ts, maxBytes)).catch((err) => console.error("log write failed:", err));
  queue = next;
  return next;
}

async function sizeOf(file: string): Promise<number> {
  try {
    return (await stat(file)).size;
  } catch {
    return 0;
  }
}

async function write(file: string, payload: HookPayload, full: boolean, ts: string, maxBytes: number): Promise<void> {
  const info = describe(payload);
  const line = full
    ? { ts, payload, known: info.known, missing: info.missing, wrong_type: info.wrong_type }
    : {
        ts,
        event: payload.hook_event_name,
        session_id: payload.session_id,
        agent_id: payload.agent_id,
        agent_type: payload.agent_type,
        tool_name: payload.tool_name,
        keys: Object.keys(payload).sort(),
        known: info.known,
        missing: info.missing,
        wrong_type: info.wrong_type,
        ...info.meta,
      };
  try {
    const text = JSON.stringify(line) + "\n";
    await mkdir(dirname(file), { recursive: true });
    // Keep one old generation: the file never grows past maxBytes, so disk use stays near twice the cap.
    const size = await sizeOf(file);
    if (size > 0 && size + Buffer.byteLength(text) > maxBytes) await rename(file, `${file}.1`);
    await appendFile(file, text);
  } catch (err) {
    console.error("log write failed:", err);
  }
}
