// A subagent spawn in Codex's terms. Observed in a real run (R-2026-11-07-08, capture "subagent", Codex 0.167.0):
// the tool is `collaborationspawn_agent` (a namespace and a tool name run together) and its tool_input is
// { task_name, fork_turns, message }. There was no `model` key because the run named no model, so whether a model can be
// requested, and under which key, is UNRESOLVED; the model is reported as null until a capture shows it.
import type { Spawn } from "../../core/event.ts";

const SUBAGENT_TOOL = "collaborationspawn_agent";

/** The brief of a spawn call, or null for any other tool call. Plain reads; cannot throw. */
export function spawnOf(p: Record<string, unknown>): Spawn | null {
  if (p.tool_name !== SUBAGENT_TOOL) return null;
  const input = typeof p.tool_input === "object" && p.tool_input !== null ? (p.tool_input as Record<string, unknown>) : {};
  return { brief: typeof input.message === "string" ? input.message : "", model: null };
}
