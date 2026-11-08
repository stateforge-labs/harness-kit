import type { Spawn } from "../../core/event.ts";
import { CodexTool } from "./names.ts";


export function spawnOf(p: Record<string, unknown>): Spawn | null {
  if (p.tool_name !== CodexTool.SpawnAgent) return null;
  const input = typeof p.tool_input === "object" && p.tool_input !== null ? (p.tool_input as Record<string, unknown>) : {};
  return { brief: typeof input.message === "string" ? input.message : "", model: null };
}
