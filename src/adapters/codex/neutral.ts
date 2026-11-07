import type { NeutralKind } from "../../core/event.ts";

/**
 * Codex's events with a shared meaning. PreModelRequest, PostModelRequest and Interrupt have none: they are still
 * validated, logged and answered `{}`, like every other event this adapter does not map.
 */
const KINDS: ReadonlyMap<string, NeutralKind> = new Map<string, NeutralKind>([
  ["SessionStart", "session-start"],
  ["SessionEnd", "session-end"],
  ["UserPromptSubmit", "prompt-submit"],
  ["PreToolUse", "pre-tool"],
  ["PostToolUse", "post-tool"],
  ["PermissionRequest", "permission-request"],
  ["SubagentStart", "subagent-start"],
  ["SubagentStop", "subagent-stop"],
  ["Stop", "stop"],
  ["PreCompact", "pre-compact"],
  ["PostCompact", "post-compact"],
]);

/** The neutral kind of a native event name. Decided by the name alone, so a damaged payload never changes it. */
export const kindOf = (native: string): NeutralKind => KINDS.get(native) ?? "other";
