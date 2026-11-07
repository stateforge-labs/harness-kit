import type { NeutralEvent, Spawn } from "./event.ts";
import type { NeutralReply } from "./reply.ts";

/**
 * The text an adapter's harness gets. It is per adapter because it names that harness's models and tools:
 * an adapter with no rules for a moment stays passive there.
 */
export interface Rules {
  sessionStart?: string;
  subagentStart?: string;
  /** One sentence about a subagent spawn, or null when the call needs no comment. */
  spawnAdvice?(spawn: Spawn): string | null;
}

/** Decide the reply to one neutral event. Pure: the same event and rules always give the same reply. */
export function policy(event: NeutralEvent, rules: Rules): NeutralReply {
  switch (event.kind) {
    case "session-start":
      return rules.sessionStart ? { context: rules.sessionStart } : {};
    case "subagent-start":
      return rules.subagentStart ? { context: rules.subagentStart } : {};
    case "pre-tool": {
      const text = event.spawn ? rules.spawnAdvice?.(event.spawn) : null;
      return text ? { context: text } : {};
    }
    default:
      return {};
  }
}
