// PreToolUse: http supported. Advisory context only for Agent calls (decided in core/policy, worded in ../spawn.ts); never denies, asks, rewrites input or changes permissions.
import type { EventHandler } from "./types.ts";

import { spawnAdvice, spawnOf } from "../spawn.ts";

const str = (v: unknown) => (typeof v === "string" ? v : null);

export const handler: EventHandler = {
  event: "PreToolUse",
  // Tool name, permission mode, subagent type, model alias and whether advice was given. Never prompt, command or tool_input contents.
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
