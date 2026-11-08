import { Harness, type NeutralEvent } from "../../core/event.ts";
import { CodexHook } from "./names.ts";
import type { NeutralReply } from "../../core/reply.ts";
import type { Decoded, HarnessAdapter } from "../../port.ts";
import { encodeHookOutput } from "../hook-output.ts";
import { commonFields, str, toolOf } from "../shared.ts";
import { output } from "./output.ts";
import { handlers } from "./handlers/index.ts";
import { hasSchema, jsonSchemas, validate } from "./index.ts";
import { kindOf } from "./neutral.ts";
import { spawnOf } from "./spawn.ts";


const nameOf = (raw: Record<string, unknown>): string | undefined =>
  typeof raw.hook_event_name === "string" ? raw.hook_event_name : undefined;

export const codex: HarnessAdapter = {
  id: Harness.Codex,
  rules: {},

  decode(raw): Decoded {
    const native = nameOf(raw);
    const h = native ? handlers.get(native) : undefined;
    if (!native || !h || !hasSchema(h.event)) return { event: null, known: false, missing: [], wrong_type: [], meta: {} };
    const v = validate(raw) ?? { missing: [], wrong_type: [] };
    const kind = kindOf(native);
    const event: NeutralEvent = { harness: Harness.Codex, kind, native, session: str(raw.session_id) };
    const tool = toolOf(kind, raw.tool_name, raw.tool_use_id);
    if (tool) event.tool = tool;
    if (native === CodexHook.PreToolUse) {
      const spawn = spawnOf(raw);
      if (spawn) event.spawn = spawn;
    }
    return { event, known: true, missing: v.missing, wrong_type: v.wrong_type, meta: h.meta(raw) };
  },

  encode(reply: NeutralReply, raw): unknown {
    return encodeHookOutput(reply, nameOf(raw), output);
  },

  common: commonFields,
  jsonSchemas,
};
