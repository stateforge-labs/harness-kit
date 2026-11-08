import type { OpenCodeAnswer } from "../../src/adapters/opencode/answer.ts";
import { Harness } from "../../src/core/event.ts";
import { pluginEnv } from "../../src/env.ts";

const OK = 200;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export async function forward(name: string, payload: unknown): Promise<OpenCodeAnswer | null> {
  try {
    const env = pluginEnv();
    const fields: Record<string, unknown> = isObject(payload) ? { ...payload } : {};
    if (typeof fields.sessionID === "string") fields.session_id = fields.sessionID;
    const res = await fetch(`${env.url}/hook/${Harness.OpenCode}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(env.token ? { authorization: `Bearer ${env.token}` } : {}) },
      body: JSON.stringify({ ...fields, hook_event_name: name }),
      signal: AbortSignal.timeout(env.timeoutMs),
    });
    if (res.status !== OK) return null;
    const answer: unknown = await res.json();
    return isObject(answer) ? (answer as OpenCodeAnswer) : null;
  } catch {
    return null;
  }
}
