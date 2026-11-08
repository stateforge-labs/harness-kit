/**
 * What the server wants to tell the harness (contract v1, ADR 0001). Every field is optional; `{}` means "say nothing".
 * Each adapter encodes a field only on the native events where its harness gives it the meaning below, and ignores it on the
 * rest. Which field lands where is the per-event matrix in docs/architecture.md ("Contract v1: what each reply field becomes").
 */
export interface NeutralReply {
  /** Text put in front of the model. */
  context?: string;
  /** Refuse the tool call (pre-tool) or the permission (permission-request). Wins over everything else. */
  deny?: Deny;
  /** Do not let the agent stop yet (stop, subagent-stop). The consumer writes the reason; the adapter only lays it out. */
  continue?: Continue;
  /** Grant the permission (permission-request only; never encoded on pre-tool, where it would skip the user's own prompts). */
  allow?: true;
}

export interface Deny {
  /** Why the call is refused. The model sees it. */
  reason: string;
  /** What to do instead, shown after the reason. */
  hint?: string;
}

export interface Continue {
  /** Why the agent must go on. The model sees it as its next instruction. */
  reason: string;
  /** What is still missing, listed after the reason, one item per line. */
  missing?: string[];
}

/** The text the model sees for a deny: the reason, then the hint on its own line. */
export const denyText = (d: Deny): string => (d.hint ? `${d.reason}\n${d.hint}` : d.reason);

/** The text the model sees for a continue: the reason, then each missing item as `- item`. */
export const continueText = (c: Continue): string =>
  c.missing?.length ? `${c.reason}\n${c.missing.map((m) => `- ${m}`).join("\n")}` : c.reason;
