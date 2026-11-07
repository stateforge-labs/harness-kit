// tool.execute.before: R-2026-11-07-08, opencode 2.2.6
import { z } from "zod";
import { common } from "../common.ts";

export const event = "tool.execute.before";

export const schema = z.looseObject({
  ...common,
  agent: z.string(),
  id: z.string(),
  messageID: z.string(),
  tool: z.string(),
  /** The tool call's arguments (a command, a path, a subagent brief). Never logged. */
  input: z.unknown(),
});
