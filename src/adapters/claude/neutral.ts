import type { NeutralKind } from "../../core/event.ts";

/** Claude Code's events with a shared meaning. Every other native event is "other": it is still validated, logged and answered `{}`. */
const KINDS: ReadonlyMap<string, NeutralKind> = new Map<string, NeutralKind>([
  ["SessionStart", "session-start"],
  ["SessionEnd", "session-end"],
  ["UserPromptSubmit", "prompt-submit"],
  ["PreToolUse", "pre-tool"],
  ["PostToolUse", "post-tool"],
  ["PostToolUseFailure", "post-tool-failure"],
  ["PermissionRequest", "permission-request"],
  ["SubagentStart", "subagent-start"],
  ["SubagentStop", "subagent-stop"],
  ["Stop", "stop"],
  ["PreCompact", "pre-compact"],
  ["PostCompact", "post-compact"],
]);

/** The neutral kind of a native event name. Decided by the name alone, so a damaged payload never changes it. */
export const kindOf = (native: string): NeutralKind => KINDS.get(native) ?? "other";
