import type { Spawn } from "../../core/event.ts";
import { OpenCodeTool } from "./names.ts";


export function spawnOf(p: Record<string, unknown>): Spawn | null {
  if (p.tool !== OpenCodeTool.Subagent) return null;
  const input = typeof p.input === "object" && p.input !== null ? (p.input as Record<string, unknown>) : {};
  return { brief: typeof input.prompt === "string" ? input.prompt : "", model: typeof input.model === "string" ? input.model : null };
}
