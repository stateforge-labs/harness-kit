import { Harness, type NeutralEvent } from "../../core/event.ts";
import type { OpenCodeAnswer } from "./answer.ts";
import { OpenCodeHook } from "./names.ts";
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
  id: Harness.OpenCode,
  rules: {},

  decode(raw): Decoded {
    const native = nameOf(raw);
    const h = native ? handlers.get(native) : undefined;
    if (!native || !h || !hasSchema(h.event)) return { event: null, known: false, missing: [], wrong_type: [], meta: {} };
    const v = validate(raw) ?? { missing: [], wrong_type: [] };
    const kind = kindOf(native);
    const event: NeutralEvent = { harness: Harness.OpenCode, kind, native, session: str(raw.sessionID) ?? str(raw.session_id) };
    const source = (raw.source ?? {}) as Record<string, unknown>;
    const tool = native === OpenCodeHook.PermissionEvaluate ? toolOf(kind, raw.action, source.id) : toolOf(kind, raw.tool, raw.id);
    if (tool) event.tool = tool;
    if (native === OpenCodeHook.ToolExecuteBefore) {
      const spawn = spawnOf(raw);
      if (spawn) event.spawn = spawn;
    }
    return { event, known: true, missing: v.missing, wrong_type: v.wrong_type, meta: h.meta(raw) };
  },

  encode(reply: NeutralReply, raw): OpenCodeAnswer {
    const native = nameOf(raw);
    if (native === OpenCodeHook.ToolExecuteBefore && reply.deny) return { deny: denyText(reply.deny) };
    if (native === OpenCodeHook.SessionExperimentalIdle && reply.continue) return { continue: continueText(reply.continue) };
    return {};
  },

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
