import { Kind, type NeutralEvent, type Spawn } from "./event.ts";
import type { NeutralReply } from "./reply.ts";

export interface Rules {
  sessionStart?: string;
  subagentStart?: string;
  spawnAdvice?(spawn: Spawn): string | null;
}

export function policy(event: NeutralEvent, rules: Rules): NeutralReply {
  switch (event.kind) {
    case Kind.SessionStart:
      return rules.sessionStart ? { context: rules.sessionStart } : {};
    case Kind.SubagentStart:
      return rules.subagentStart ? { context: rules.subagentStart } : {};
    case Kind.PreTool: {
      const text = event.spawn ? rules.spawnAdvice?.(event.spawn) : null;
      return text ? { context: text } : {};
    }
    default:
      return {};
  }
}
