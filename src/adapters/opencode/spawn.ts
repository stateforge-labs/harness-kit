// A subagent spawn in OpenCode's terms, observed on 2.2.6 (R-2026-11-07-08, capture "subagent"): the tool is `subagent` and its
// input is { agent, description, prompt }. OpenCode's own code reads an optional `model` from that input, so it is passed on when
// present; no capture set one, so whether a model can be requested this way is UNRESOLVED.
import type { Spawn } from "../../core/event.ts";

const SUBAGENT_TOOL = "subagent";

/** The brief of a spawn call, or null for any other tool call. Plain reads; cannot throw. */
export function spawnOf(p: Record<string, unknown>): Spawn | null {
  if (p.tool !== SUBAGENT_TOOL) return null;
  const input = typeof p.input === "object" && p.input !== null ? (p.input as Record<string, unknown>) : {};
  return { brief: typeof input.prompt === "string" ? input.prompt : "", model: typeof input.model === "string" ? input.model : null };
}
