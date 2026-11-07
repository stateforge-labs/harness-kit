import { z } from "zod";
import { PermissionMode } from "./enums.ts";

/**
 * Fields every Claude Code hook payload can carry (R-2026-11-07-05, judged files and 164 captures).
 * The first four are always present. The rest appear on some events or builds only, so they are optional.
 * Event schemas spread this and may tighten a key (SubagentStart makes agent_id required).
 */
export const common = {
  session_id: z.string(),
  transcript_path: z.string(),
  cwd: z.string(),
  hook_event_name: z.string(),
  /** Absent on some events and older builds. */
  prompt_id: z.string().optional(),
  /** Per-session scratch directory; seen on some payloads only. */
  scratchpad_dir: z.string().optional(),
  /** "Not all events receive this field" (hooks.md line 746). */
  permission_mode: PermissionMode.optional(),
  effort: z.looseObject({ level: z.string() }).optional(),
  /** Set when the event happens inside a subagent or teammate. */
  agent_id: z.string().optional(),
  agent_type: z.string().optional(),
};
