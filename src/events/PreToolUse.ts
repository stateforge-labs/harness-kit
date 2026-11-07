// PreToolUse: http supported. Advisory context only for Agent calls; never denies, asks, rewrites input or changes permissions.
import type { EventHandler, HookPayload } from "./types.ts";

const str = (v: unknown) => (typeof v === "string" ? v : null);

const SUBAGENT_TOOL = "Agent";
const FORMAT_SIGN = /words?|limit|return|format/i;
const ADVICE_NO_FORMAT = "Advisory: this Agent brief sets no return format or word limit, so ask for a short structured result.";
const ADVICE_MODEL = "Advisory: this Agent call sets a non-Haiku model, so confirm that the cost is intended.";
const ADVICE_BOTH = "Advisory: this Agent brief sets no return format or word limit and sets a non-Haiku model, so state a short return format and confirm the model choice.";

/** The one advisory sentence for an Agent call, or null when the call needs no comment. */
function advice(p: HookPayload): string | null {
  if (p.tool_name !== SUBAGENT_TOOL) return null;
  const input = (p.tool_input ?? {}) as Record<string, unknown>;
  const prompt = str(input.prompt) ?? "";
  const model = str(input.model);
  const noFormat = !FORMAT_SIGN.test(prompt);
  const nonHaikuModel = model !== null && model !== "" && model !== "haiku";
  if (noFormat && nonHaikuModel) return ADVICE_BOTH;
  if (noFormat) return ADVICE_NO_FORMAT;
  if (nonHaikuModel) return ADVICE_MODEL;
  return null;
}

export const handler: EventHandler = {
  event: "PreToolUse",
  required: ["tool_name", "tool_input", "tool_use_id"],
  // Tool name, permission mode, subagent type, model alias and whether advice was given. Never prompt, command or tool_input contents.
  meta: (p) => {
    const input = (p.tool_input ?? {}) as Record<string, unknown>;
    return {
      tool_name: str(p.tool_name),
      permission_mode: str(p.permission_mode),
      subagent_type: str(input.subagent_type),
      model: str(input.model),
      advised: advice(p) !== null,
    };
  },
  respond: (p) => {
    const text = advice(p);
    if (text === null) return {};
    return { hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: text } };
  },
};
