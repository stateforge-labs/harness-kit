import type { EventHandler, MetaValue } from "./types.ts";
import { ClaudeHook } from "../names.ts";

const str = (v: unknown): MetaValue => (typeof v === "string" ? v : null);

export const handler: EventHandler = {
  event: ClaudeHook.UserPromptExpansion,
  meta: (p) => ({
    expansion_type: str(p.expansion_type),
    command_name: str(p.command_name),
    command_source: str(p.command_source),
  }),
};
