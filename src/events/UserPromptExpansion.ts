import type { EventHandler, MetaValue } from "./types.ts";

const str = (v: unknown): MetaValue => (typeof v === "string" ? v : null);

// Passive: this event may block or add context, but the policy here only observes. Never returns decision or additionalContext.
// Observed command_source values in real captures: "projectSettings" (UserPromptExpansion-1..3) and "plugin" (UserPromptExpansion-7).
// prompt_id and permission_mode are always present in captures but are not in `required`, because the spec marks them optional.
// A hook reply of hookSpecificOutput.additionalContext is injected (UserPromptExpansion-8); top-level additionalContext is not echoed (UserPromptExpansion-9).
export const handler: EventHandler = {
  event: "UserPromptExpansion",
  required: ["expansion_type", "command_name", "command_args", "command_source", "prompt"],
  meta: (p) => ({
    expansion_type: str(p.expansion_type),
    command_name: str(p.command_name),
    command_source: str(p.command_source),
  }),
  respond: () => ({}),
};
