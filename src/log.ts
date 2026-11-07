import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { describe, type HookPayload } from "./handlers.ts";

/**
 * One JSONL line per event. By default only metadata (no prompts, no
 * tool_input), enough to count events per session/agent. HOOK_LOG_PAYLOAD=1
 * stores the full body so real payload shapes can be studied before building a
 * call review. Failures never reach the hook response.
 */
export async function logEvent(
  file: string,
  payload: HookPayload,
  full: boolean,
  ts: string,
): Promise<void> {
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
    await mkdir(dirname(file), { recursive: true });
    await appendFile(file, JSON.stringify(line) + "\n");
  } catch (err) {
    console.error("log write failed:", err);
  }
}
