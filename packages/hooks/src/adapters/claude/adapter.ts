import type { NeutralEvent } from "../../core/event.ts";
import type { NeutralReply } from "../../core/reply.ts";
import type { Decoded, HarnessAdapter } from "../../port.ts";
import { commonFields, encodeHookOutput, str, toolOf, type HookOutputRules } from "../shared.ts";
import { handlers } from "./handlers/index.ts";
import { claudeRules } from "./rules.ts";
import { hasSchema, jsonSchemas, validate } from "./index.ts";
import { kindOf } from "./neutral.ts";
import { spawnOf } from "./spawn.ts";

/** Events whose answer may carry `hookSpecificOutput.additionalContext`. The core only produces context for these. */
const OUTPUT: HookOutputRules = {
  context: new Set(["SessionStart", "SubagentStart", "PreToolUse"]),
  stop: new Set(["Stop", "SubagentStop"]),
};

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
    const kind = kindOf(native);
    const event: NeutralEvent = { harness: "claude", kind, native, session: str(raw.session_id) };
    const tool = toolOf(kind, raw.tool_name, raw.tool_use_id);
    if (tool) event.tool = tool;
    if (native === "PreToolUse") {
      const spawn = spawnOf(raw);
      if (spawn) event.spawn = spawn;
    }
    return { event, known: true, missing: v.missing, wrong_type: v.wrong_type, meta: h.meta(raw) };
  },

  encode(reply: NeutralReply, raw): unknown {
    return encodeHookOutput(reply, nameOf(raw), OUTPUT);
  },

  common: commonFields,

  jsonSchemas,
};
