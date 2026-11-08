import type { NeutralEvent } from "../../core/event.ts";
import type { NeutralReply } from "../../core/reply.ts";
import type { Common, Decoded, HarnessAdapter } from "../../port.ts";
import { continueText, denyText } from "../../core/reply.ts";
import { str, toolOf } from "../shared.ts";
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
    const kind = kindOf(native);
    const event: NeutralEvent = { harness: "opencode", kind, native, session: str(raw.sessionID) ?? str(raw.session_id) };
    // permission.evaluate names the permission in `action` (the tool's name for MCP tools, e.g. `probe_echo`; a permission name
    // such as `shell` for built-ins) and the call in `source.id`.
    const source = (raw.source ?? {}) as Record<string, unknown>;
    const tool = native === "permission.evaluate" ? toolOf(kind, raw.action, source.id) : toolOf(kind, raw.tool, raw.id);
    if (tool) event.tool = tool;
    if (native === "tool.execute.before") {
      const spawn = spawnOf(raw);
      if (spawn) event.spawn = spawn;
    }
    return { event, known: true, missing: v.missing, wrong_type: v.wrong_type, meta: h.meta(raw) };
  },

  /**
   * OpenCode hooks change things by what the plugin does, so the answer is an instruction to the plugin
   * (clients/opencode/plugin.ts), not a harness wire format. Measured in R-2026-11-07-10 (`opencode/q4-throw-deny`,
   * `opencode/q4-idle-continue`):
   * - `tool.execute.before` with a deny: `{ deny: text }`; the plugin throws it, the tool does not run and the model sees the text.
   * - `session.experimental.idle` with a continue: `{ continue: text }`; the plugin sends it as a synthetic user message.
   * Everything else is `{}`: context has nowhere to go yet, and `permission.evaluate` is not acted on in v1 (the pre-tool deny
   * already refuses the call).
   */
  encode(reply: NeutralReply, raw): unknown {
    const native = nameOf(raw);
    if (native === "tool.execute.before" && reply.deny) return { deny: denyText(reply.deny) };
    if (native === "session.experimental.idle" && reply.continue) return { continue: continueText(reply.continue) };
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
