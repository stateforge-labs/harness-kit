import type { NeutralEvent } from "../../core/event.ts";
import type { NeutralReply } from "../../core/reply.ts";
import type { Decoded, HarnessAdapter } from "../../port.ts";
import { commonFields, encodeHookOutput, str, toolOf, type HookOutputRules } from "../shared.ts";
import { handlers } from "./handlers/index.ts";
import { hasSchema, jsonSchemas, validate } from "./index.ts";
import { kindOf } from "./neutral.ts";
import { spawnOf } from "./spawn.ts";

/**
 * Codex takes `hookSpecificOutput` only on these events (R-2026-11-07-04, from the pinned output schemas). Every other
 * event, SessionEnd included (it has no output schema), is answered `{}`.
 */
const OUTPUT: HookOutputRules = {
  context: new Set(["PreToolUse", "SessionStart", "SubagentStart", "UserPromptSubmit"]),
  stop: new Set(["Stop", "SubagentStop"]),
};

const nameOf = (raw: Record<string, unknown>): string | undefined =>
  typeof raw.hook_event_name === "string" ? raw.hook_event_name : undefined;

export const codex: HarnessAdapter = {
  id: "codex",
  // No rules yet: the Claude rules name Claude models and tools, so Codex sessions are answered passively until
  // their wording is decided (user decision 2026-11-07).
  rules: {},

  decode(raw): Decoded {
    const native = nameOf(raw);
    const h = native ? handlers.get(native) : undefined;
    if (!native || !h || !hasSchema(h.event)) return { event: null, known: false, missing: [], wrong_type: [], meta: {} };
    const v = validate(raw) ?? { missing: [], wrong_type: [] };
    const kind = kindOf(native);
    const event: NeutralEvent = { harness: "codex", kind, native, session: str(raw.session_id) };
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
