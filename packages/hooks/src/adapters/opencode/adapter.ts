import type { NeutralEvent } from "../../core/event.ts";
import type { NeutralReply } from "../../core/reply.ts";
import type { Common, Decoded, HarnessAdapter } from "../../port.ts";
import { handlers } from "./handlers/index.ts";
import { hasSchema, jsonSchemas, validate } from "./index.ts";
import { kindOf } from "./neutral.ts";
import { spawnOf } from "./spawn.ts";

const nameOf = (raw: Record<string, unknown>): string | undefined =>
  typeof raw.hook_event_name === "string" ? raw.hook_event_name : undefined;

export const opencode: HarnessAdapter = {
  id: "opencode",
  // No rules yet: OpenCode sessions are answered passively until their wording is decided (user decision 2026-11-07).
  rules: {},

  decode(raw): Decoded {
    const native = nameOf(raw);
    const h = native ? handlers.get(native) : undefined;
    if (!native || !h || !hasSchema(h.event)) return { event: null, known: false, missing: [], wrong_type: [], meta: {} };
    const v = validate(raw) ?? { missing: [], wrong_type: [] };
    const event: NeutralEvent = { harness: "opencode", kind: kindOf(native), native };
    if (native === "tool.execute.before") {
      const spawn = spawnOf(raw);
      if (spawn) event.spawn = spawn;
    }
    return { event, known: true, missing: v.missing, wrong_type: v.wrong_type, meta: h.meta(raw) };
  },

  /**
   * Always `{}`. The plugin does not read the answer: OpenCode's hooks are changed by mutating their arguments, and this server
   * only reports. A reply with context has nowhere to go until the plugin and a policy exist for it.
   */
  encode(_reply: NeutralReply, _raw): unknown {
    return {};
  },

  /** OpenCode's keys: `tool` is the tool name, `agent` the agent name (`build`, `general`). The plugin adds `session_id`. */
  common(raw): Common {
    return {
      event: raw.hook_event_name,
      session_id: raw.session_id ?? raw.sessionID,
      agent_id: undefined,
      agent_type: raw.agent,
      tool_name: raw.tool,
    };
  },
  jsonSchemas,
};
