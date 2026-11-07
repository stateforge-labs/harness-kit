// The advisory on an Agent call, in Claude Code's terms: the `Agent` tool, `tool_input.prompt`, `tool_input.model`.
import type { Spawn } from "../../core/event.ts";
import type { HookPayload } from "./handlers/types.ts";

const str = (v: unknown) => (typeof v === "string" ? v : null);

const SUBAGENT_TOOL = "Agent";
const FORMAT_SIGN = /words?|limit|return|format/i;
const ADVICE_NO_FORMAT = "Advisory: this Agent brief sets no return format or word limit, so ask for a short structured result.";
const ADVICE_MODEL = "Advisory: this Agent call sets a non-Haiku model, so confirm that the cost is intended.";
const ADVICE_BOTH = "Advisory: this Agent brief sets no return format or word limit and sets a non-Haiku model, so state a short return format and confirm the model choice.";

/** The brief and model of an Agent call, or null for any other tool call. Plain reads; cannot throw. */
export function spawnOf(p: HookPayload): Spawn | null {
  if (p.tool_name !== SUBAGENT_TOOL) return null;
  const input = (p.tool_input ?? {}) as Record<string, unknown>;
  return { brief: str(input.prompt) ?? "", model: str(input.model) };
}

/** The one advisory sentence for an Agent call, or null when the call needs no comment. */
export function spawnAdvice(spawn: Spawn): string | null {
  const noFormat = !FORMAT_SIGN.test(spawn.brief);
  const nonHaikuModel = spawn.model !== null && spawn.model !== "" && spawn.model !== "haiku";
  if (noFormat && nonHaikuModel) return ADVICE_BOTH;
  if (noFormat) return ADVICE_NO_FORMAT;
  if (nonHaikuModel) return ADVICE_MODEL;
  return null;
}
