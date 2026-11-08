import type { NeutralKind } from "../../core/event.ts";

/**
 * OpenCode's hooks and events with a shared meaning. The rest (execution started/succeeded/failed/interrupted) are "other": still
 * validated, logged and answered `{}`. `session.created` is "session-start" for every session, a subagent's child session included;
 * whether it is a child shows in the log as `is_child`, and the kind is not split on it because a kind comes from the name alone.
 */
const KINDS: ReadonlyMap<string, NeutralKind> = new Map<string, NeutralKind>([
  ["session.created", "session-start"],
  ["session.prompt", "prompt-submit"],
  ["tool.execute.before", "pre-tool"],
  ["tool.execute.after", "post-tool"],
  ["permission.evaluate", "permission-request"],
  // The idle hook is awaited, so a continue can be acted on there; execution.succeeded is an event the plugin cannot answer.
  ["session.experimental.idle", "stop"],
  ["session.compaction", "pre-compact"],
  ["session.compaction.started", "pre-compact"],
  ["session.compaction.ended", "post-compact"],
]);

/** The neutral kind of a native event name. Decided by the name alone, so a damaged payload never changes it. */
export const kindOf = (native: string): NeutralKind => KINDS.get(native) ?? "other";
