import { OpenCodeHook } from "../../src/adapters/opencode/names.ts";
import { forward } from "./forward.ts";

const PARENT_WAIT_MS = 300;
const TEXT_PART = "text";

const seen = new Set<string>();
const parents = new Map<string, string>();
const waiters = new Map<string, () => void>();
const rules = new Map<string, Promise<string | null>>();

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function noteSession(data: unknown): void {
  if (!isObject(data) || typeof data.sessionID !== "string") return;
  seen.add(data.sessionID);
  if (typeof data.parentID === "string") parents.set(data.sessionID, data.parentID);
  waiters.get(data.sessionID)?.();
}

function parentOf(sessionID: string): Promise<string | null> {
  if (seen.has(sessionID)) return Promise.resolve(parents.get(sessionID) ?? null);
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      waiters.delete(sessionID);
      resolve(parents.get(sessionID) ?? null);
    };
    const timer = setTimeout(done, PARENT_WAIT_MS);
    waiters.set(sessionID, done);
  });
}

async function rulesFor(sessionID: string, event: Record<string, unknown>): Promise<string | null> {
  const parentID = await parentOf(sessionID);
  const model = isObject(event.model) ? { id: event.model.id, providerID: event.model.providerID } : undefined;
  const answer = await forward(OpenCodeHook.SessionContext, {
    sessionID,
    agent: event.agent,
    ...(model ? { model } : {}),
    ...(parentID ? { parentID } : {}),
  });
  return typeof answer?.context === "string" && answer.context !== "" ? answer.context : null;
}

export async function addRules(event: unknown): Promise<void> {
  if (!isObject(event) || typeof event.sessionID !== "string" || !Array.isArray(event.system)) return;
  const sessionID = event.sessionID;
  let pending = rules.get(sessionID);
  if (!pending) {
    pending = rulesFor(sessionID, event);
    rules.set(sessionID, pending);
  }
  const text = await pending;
  if (text) event.system.push({ type: TEXT_PART, text });
}
