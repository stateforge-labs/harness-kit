import type { NeutralEvent } from "../../core/event.ts";
import type { NeutralReply } from "../../core/reply.ts";
import type { Common, Decoded, HarnessAdapter } from "../../port.ts";
import { handlers } from "./handlers/index.ts";
import { claudeRules } from "./rules.ts";
import { hasSchema, jsonSchemas, validate } from "./index.ts";
import { kindOf } from "./neutral.ts";
import { spawnOf } from "./spawn.ts";

/** Events whose answer may carry `hookSpecificOutput.additionalContext`. The core only produces context for these. */
const CONTEXT_EVENTS: ReadonlySet<string> = new Set(["SessionStart", "SubagentStart", "PreToolUse"]);

const nameOf = (raw: Record<string, unknown>): string | undefined =>
  typeof raw.hook_event_name === "string" ? raw.hook_event_name : undefined;

export const claude: HarnessAdapter = {
  id: "claude",
  rules: claudeRules,

  decode(raw): Decoded {
    const native = nameOf(raw);
    const h = native ? handlers.get(native) : undefined;
    if (!native || !h || !hasSchema(h.event)) return { event: null, known: false, missing: [], wrong_type: [], meta: {} };
    const v = validate(raw) ?? { missing: [], wrong_type: [] };
    const event: NeutralEvent = { harness: "claude", kind: kindOf(native), native };
    if (native === "PreToolUse") {
      const spawn = spawnOf(raw);
      if (spawn) event.spawn = spawn;
    }
    return { event, known: true, missing: v.missing, wrong_type: v.wrong_type, meta: h.meta(raw) };
  },

  encode(reply: NeutralReply, raw): unknown {
    const native = nameOf(raw);
    if (!reply.context || !native || !CONTEXT_EVENTS.has(native)) return {};
    return { hookSpecificOutput: { hookEventName: native, additionalContext: reply.context } };
  },

  common: (raw): Common => ({
    event: raw.hook_event_name,
    session_id: raw.session_id,
    agent_id: raw.agent_id,
    agent_type: raw.agent_type,
    tool_name: raw.tool_name,
  }),

  jsonSchemas,
};
