import type { HarnessId, MetaValue, NeutralEvent } from "./core/event.ts";
import type { NeutralReply } from "./core/reply.ts";
import type { Rules } from "./core/policy.ts";

export interface Decoded {
  event: NeutralEvent | null;
  known: boolean;
  missing: string[];
  wrong_type: string[];
  meta: Record<string, MetaValue>;
}

export interface Common {
  event?: unknown;
  session_id?: unknown;
  agent_id?: unknown;
  agent_type?: unknown;
  tool_name?: unknown;
}

export interface HarnessAdapter {
  readonly id: HarnessId;
  readonly rules: Rules;
  decode(raw: Record<string, unknown>): Decoded;
  encode(reply: NeutralReply, raw: Record<string, unknown>): unknown;
  common(raw: Record<string, unknown>): Common;
  jsonSchemas(): Record<string, unknown>;
}
