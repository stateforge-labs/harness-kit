import type { EventHandler } from "./types.ts";

import { spawnAdvice, spawnOf } from "../spawn.ts";
import { ClaudeHook } from "../names.ts";

const str = (v: unknown) => (typeof v === "string" ? v : null);

export const handler: EventHandler = {
  event: ClaudeHook.PreToolUse,
  meta: (p) => {
    const input = (p.tool_input ?? {}) as Record<string, unknown>;
    const spawn = spawnOf(p);
    return {
      tool_name: str(p.tool_name),
      permission_mode: str(p.permission_mode),
      subagent_type: str(input.subagent_type),
      model: str(input.model),
      advised: spawn !== null && spawnAdvice(spawn) !== null,
    };
  },
};
