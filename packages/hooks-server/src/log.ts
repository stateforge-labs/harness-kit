import { appendFile, mkdir, rename, stat } from "node:fs/promises";
import { dirname } from "node:path";
import type { Handled } from "@stateforge-labs/harness-hooks";

let queue: Promise<void> = Promise.resolve();

export function flushLog(): Promise<void> {
  return queue;
}

const MAX_FIELD_CHARS = 256;
const MAX_KEYS = 100;

const label = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

function clip(v: unknown): unknown {
  if (typeof v === "string") return v.length > MAX_FIELD_CHARS ? `${v.slice(0, MAX_FIELD_CHARS)}...[${v.length} chars]` : v;
  if (Array.isArray(v)) return v.slice(0, MAX_KEYS).map(clip);
  return v;
}

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

async function write(file: string, text: string, maxBytes: number): Promise<void> {
  try {
    await mkdir(dirname(file), { recursive: true, mode: 0o700 });
    const size = await sizeOf(file);
    if (size > 0 && size + Buffer.byteLength(text) > maxBytes) {
      try {
        await rename(file, `${file}.1`);
      } catch (err) {
        console.error("log rotation failed, appending past the cap:", err);
      }
    }
    await appendFile(file, text, { mode: 0o600 });
  } catch (err) {
    console.error("log write failed:", err);
  }
}
