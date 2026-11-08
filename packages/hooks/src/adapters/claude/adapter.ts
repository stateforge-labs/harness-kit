import { Harness, Kind, type NeutralEvent } from "../../core/event.ts";
import { ClaudeHook } from "./names.ts";
import type { NeutralReply } from "../../core/reply.ts";
import type { Decoded, HarnessAdapter } from "../../port.ts";
import { encodeHookOutput } from "../hook-output.ts";
import { commonFields, str, toolOf } from "../shared.ts";
import { output } from "./output.ts";
import { handlers } from "./handlers/index.ts";
import { claudeRules } from "./rules.ts";
import { hasSchema, jsonSchemas, validate } from "./index.ts";
import { kindOf } from "./neutral.ts";
import { spawnOf } from "./spawn.ts";


const nameOf = (raw: Record<string, unknown>): string | undefined =>
  typeof raw.hook_event_name === "string" ? raw.hook_event_name : undefined;

export const claude: HarnessAdapter = {
  id: Harness.Claude,
  rules: claudeRules,

  decode(raw): Decoded {
    const native = nameOf(raw);
    const h = native ? handlers.get(native) : undefined;
    if (!native || !h || !hasSchema(h.event)) return { event: null, known: false, missing: [], wrong_type: [], meta: {} };
    const v = validate(raw) ?? { missing: [], wrong_type: [] };
    const kind = kindOf(native);
    const event: NeutralEvent = { harness: Harness.Claude, kind, native, session: str(raw.session_id) };
    const tool = toolOf(kind, raw.tool_name, raw.tool_use_id);
    if (tool) event.tool = tool;
    if (native === ClaudeHook.PreToolUse) {
      const spawn = spawnOf(raw);
      if (spawn) event.spawn = spawn;
    }
    if (kind === Kind.WorktreeCreate) event.worktree = { cwd: str(raw.cwd), name: str(raw.name) ?? undefined };
    if (kind === Kind.WorktreeRemove) event.worktree = { cwd: str(raw.cwd), path: str(raw.worktree_path) ?? undefined };
    return { event, known: true, missing: v.missing, wrong_type: v.wrong_type, meta: h.meta(raw) };
  },

  encode(reply: NeutralReply, raw): unknown {
    return encodeHookOutput(reply, nameOf(raw), output);
  },

  common: commonFields,

  jsonSchemas,
};
