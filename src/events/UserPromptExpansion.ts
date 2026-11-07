import type { EventHandler, MetaValue } from "./types.ts";

const str = (v: unknown): MetaValue => (typeof v === "string" ? v : null);

// Passive: this event may block or add context, but the policy here only observes. Never returns decision or additionalContext.
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
